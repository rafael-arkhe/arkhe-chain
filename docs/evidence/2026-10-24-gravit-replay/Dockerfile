FROM 0f65c70efd46927afd01a86aa27d7b49e5e84e1189cce56587e2874c96521979
COPY gravit_replay.py test_gravit_replay.py trusted-context.json /opt/replay/
COPY fixtures /opt/replay/fixtures/
ENTRYPOINT ["python", "-I", "/opt/replay/gravit_replay.py"]
CMD []
