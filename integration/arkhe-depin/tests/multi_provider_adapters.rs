use arkhe_depin::{
    adapters::{
        filecoin::{FilecoinAdapter, FilecoinDealReceipt},
        helium::{HeliumAdapter, HeliumWitnessReceipt},
        validate_native_receipt,
        vangrid::{VangridAdapter, VangridJobReceipt},
        ReceiptAdapter,
    },
    proof::{CompositeProof, Mmr},
    types::AttestedReceipt,
};

#[test]
fn filecoin_helium_vangrid_normalize_validate_and_anchor() {
    let filecoin: FilecoinDealReceipt =
        serde_json::from_str(include_str!("../fixtures/filecoin_deal.synthetic.json")).unwrap();
    let helium: HeliumWitnessReceipt =
        serde_json::from_str(include_str!("../fixtures/helium_witness.synthetic.json")).unwrap();
    let vangrid: VangridJobReceipt =
        serde_json::from_str(include_str!("../fixtures/vangrid_job.synthetic.json")).unwrap();

    let receipts = [
        FilecoinAdapter::normalize(&filecoin).unwrap(),
        HeliumAdapter::normalize(&helium).unwrap(),
        VangridAdapter::normalize(&vangrid).unwrap(),
    ];
    for receipt in &receipts {
        validate_native_receipt(receipt).unwrap();
    }

    let mut mmr = Mmr::new();
    for receipt in receipts {
        let proof = CompositeProof::anchor(
            &AttestedReceipt {
                receipt,
                hardware_attestation: None,
            },
            &mut mmr,
        )
        .unwrap();
        proof.verify(&mmr.checkpoint().unwrap()).unwrap();
    }
}

#[test]
fn providers_reject_invalid_fields() {
    let mut filecoin: FilecoinDealReceipt =
        serde_json::from_str(include_str!("../fixtures/filecoin_deal.synthetic.json")).unwrap();
    filecoin.piece_cid.clear();
    assert!(FilecoinAdapter::normalize(&filecoin).is_err());

    let mut helium: HeliumWitnessReceipt =
        serde_json::from_str(include_str!("../fixtures/helium_witness.synthetic.json")).unwrap();
    helium.witnesses.push(helium.witnesses[0].clone());
    assert!(HeliumAdapter::normalize(&helium).is_err());

    let mut vangrid: VangridJobReceipt =
        serde_json::from_str(include_str!("../fixtures/vangrid_job.synthetic.json")).unwrap();
    vangrid.completed_at = -1;
    assert!(VangridAdapter::normalize(&vangrid).is_err());
}

#[test]
fn receipt_adapter_trait_object_style_calls() {
    let filecoin: FilecoinDealReceipt =
        serde_json::from_str(include_str!("../fixtures/filecoin_deal.synthetic.json")).unwrap();
    let native = <FilecoinAdapter as ReceiptAdapter>::normalize(&filecoin).unwrap();
    <FilecoinAdapter as ReceiptAdapter>::validate(&native).unwrap();
}
