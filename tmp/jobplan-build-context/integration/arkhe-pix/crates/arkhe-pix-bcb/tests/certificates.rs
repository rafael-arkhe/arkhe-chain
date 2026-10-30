use arkhe_pix_bcb::certificates::*;

fn registration(purpose: Purpose) -> Registration {
    Registration {
        certificate_sha256: [1; 32],
        public_key_sha256: [2; 32],
        purpose,
        environment: Environment::Pix,
        valid_from: 100,
        valid_until: 300,
        chain_checked: true,
        revocation_good_until: Some(250),
        revoked: false,
    }
}

#[test]
fn certpic_cannot_sign_and_certpia_cannot_authenticate_a_channel() {
    for (purpose, wrong) in [
        (Purpose::CertpicChannel, Purpose::CertpiaMessage),
        (Purpose::CertpiaMessage, Purpose::CertpicChannel),
    ] {
        let registry = CertificateRegistry::new(vec![registration(purpose)]).unwrap();
        assert_eq!(
            registry.authorize(&[1; 32], purpose, Environment::Pix, 200),
            Ok(())
        );
        assert_eq!(
            registry.authorize(&[1; 32], wrong, Environment::Pix, 200),
            Err(CertificateError::WrongPurpose)
        );
        for environment in [Environment::Spb, Environment::Mes] {
            assert_eq!(
                registry.authorize(&[1; 32], purpose, environment, 200),
                Err(CertificateError::WrongEnvironment)
            );
        }
    }
}

#[test]
fn unknown_revoked_expired_and_unchecked_certificates_fail_closed() {
    let valid = registration(Purpose::CertpicChannel);
    let registry = CertificateRegistry::new(vec![valid.clone()]).unwrap();
    assert_eq!(
        registry.authorize(&[9; 32], valid.purpose, Environment::Pix, 200),
        Err(CertificateError::UnknownCertificate)
    );
    for now in [99, 300] {
        assert_eq!(
            registry.authorize(&[1; 32], valid.purpose, Environment::Pix, now),
            Err(CertificateError::InactiveCertificate)
        );
    }
    let mut revoked = valid.clone();
    revoked.revoked = true;
    assert_eq!(
        CertificateRegistry::new(vec![revoked]).unwrap().authorize(
            &[1; 32],
            valid.purpose,
            Environment::Pix,
            200
        ),
        Err(CertificateError::InactiveCertificate)
    );
    for entry in [
        Registration {
            chain_checked: false,
            ..valid.clone()
        },
        Registration {
            revocation_good_until: None,
            ..valid.clone()
        },
        Registration {
            revocation_good_until: Some(200),
            ..valid.clone()
        },
    ] {
        assert_eq!(
            CertificateRegistry::new(vec![entry]).unwrap().authorize(
                &[1; 32],
                valid.purpose,
                Environment::Pix,
                200
            ),
            Err(CertificateError::TrustNotChecked)
        );
    }
}

#[test]
fn reusing_certificate_or_key_across_purposes_is_rejected() {
    let channel = registration(Purpose::CertpicChannel);
    let mut message = registration(Purpose::CertpiaMessage);
    message.certificate_sha256 = [3; 32];
    assert!(matches!(
        CertificateRegistry::new(vec![channel.clone(), message]),
        Err(CertificateError::ReusedCredential)
    ));
    assert!(matches!(
        CertificateRegistry::new(vec![channel.clone(), channel]),
        Err(CertificateError::ReusedCredential)
    ));
}

#[test]
fn signing_entry_point_rejects_certpic_and_does_not_enable_production_for_certpia() {
    use arkhe_pix_bcb::{BcbClient, BcbError};
    let client = BcbClient::new("https://psp.invalid");
    let channel = CertificateRegistry::new(vec![registration(Purpose::CertpicChannel)]).unwrap();
    assert!(matches!(
        client.prepare_message_signing(&channel, &[1; 32], Environment::Pix, 200),
        Err(BcbError::Certificate(CertificateError::WrongPurpose))
    ));
    let message = CertificateRegistry::new(vec![registration(Purpose::CertpiaMessage)]).unwrap();
    assert!(matches!(
        client.prepare_message_signing(&message, &[1; 32], Environment::Pix, 200),
        Err(BcbError::NotImplemented(_))
    ));
}
