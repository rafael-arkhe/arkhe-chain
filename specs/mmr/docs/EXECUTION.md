# Execution record

Command:

`python tests/verify_mmr_vectors.py`

Exit code: `0`

Output:

```text
PASS: committed MMR vectors are structurally complete for sizes [4, 1, 3, 5, 7]
n=1 mmr_size=1 root=60499eb380feaca0c5b5385982e20abe3b4b3ef7ff5037dfad344b5f8a802c7b
  0 []
n=3 mmr_size=4 root=edf432b5854467f8ceaa0102e37dae99200e96c9b184b02681ad4145ac4cbbf0
  0 [('node', 'right', 'f158535bbffb524797d1a34a9dc6b59281f7e5eafacfef8ab9bbbda2a97d0be5'), ('bag', 'right', '00f32b9b5d0c34bf15d666e0f470631491902efe447db7c262a1d54d3ff591c5')]
  1 [('node', 'left', '60499eb380feaca0c5b5385982e20abe3b4b3ef7ff5037dfad344b5f8a802c7b'), ('bag', 'right', '00f32b9b5d0c34bf15d666e0f470631491902efe447db7c262a1d54d3ff591c5')]
  2 [('bag', 'left', 'f372742b780b1e913a79685dfa797b92716f38576d35b08840a369eafb26360c')]
n=4 mmr_size=7 root=ff55b1c86c203cbc5c84a79803d4f921e317a8e72c0645535db4c1cc2e7d5d94
  0 [('node', 'right', 'f158535bbffb524797d1a34a9dc6b59281f7e5eafacfef8ab9bbbda2a97d0be5'), ('node', 'right', '093480f00e08134da4e5aabcb1034e154800e07f9db0888a9631fca322aa3c95')]
  1 [('node', 'left', '60499eb380feaca0c5b5385982e20abe3b4b3ef7ff5037dfad344b5f8a802c7b'), ('node', 'right', '093480f00e08134da4e5aabcb1034e154800e07f9db0888a9631fca322aa3c95')]
  2 [('node', 'right', 'ae0a16419db8f57ecc730b1fcd8c2957637e5a5dbd83078960759a9b9bf8b637'), ('node', 'left', 'f372742b780b1e913a79685dfa797b92716f38576d35b08840a369eafb26360c')]
  3 [('node', 'left', '00f32b9b5d0c34bf15d666e0f470631491902efe447db7c262a1d54d3ff591c5'), ('node', 'left', 'f372742b780b1e913a79685dfa797b92716f38576d35b08840a369eafb26360c')]
n=5 mmr_size=8 root=3686670ec4a843bc3caaf0d302906e7cb161f791ddbd739ffa0dbeda61f069bf
  0 [('node', 'right', 'f158535bbffb524797d1a34a9dc6b59281f7e5eafacfef8ab9bbbda2a97d0be5'), ('node', 'right', '093480f00e08134da4e5aabcb1034e154800e07f9db0888a9631fca322aa3c95'), ('bag', 'right', '014486f26ca863608c1ffb242275bbcbcf1479a662124e631d1719a0b795f71a')]
  1 [('node', 'left', '60499eb380feaca0c5b5385982e20abe3b4b3ef7ff5037dfad344b5f8a802c7b'), ('node', 'right', '093480f00e08134da4e5aabcb1034e154800e07f9db0888a9631fca322aa3c95'), ('bag', 'right', '014486f26ca863608c1ffb242275bbcbcf1479a662124e631d1719a0b795f71a')]
  2 [('node', 'right', 'ae0a16419db8f57ecc730b1fcd8c2957637e5a5dbd83078960759a9b9bf8b637'), ('node', 'left', 'f372742b780b1e913a79685dfa797b92716f38576d35b08840a369eafb26360c'), ('bag', 'right', '014486f26ca863608c1ffb242275bbcbcf1479a662124e631d1719a0b795f71a')]
  3 [('node', 'left', '00f32b9b5d0c34bf15d666e0f470631491902efe447db7c262a1d54d3ff591c5'), ('node', 'left', 'f372742b780b1e913a79685dfa797b92716f38576d35b08840a369eafb26360c'), ('bag', 'right', '014486f26ca863608c1ffb242275bbcbcf1479a662124e631d1719a0b795f71a')]
  4 [('bag', 'left', 'ff55b1c86c203cbc5c84a79803d4f921e317a8e72c0645535db4c1cc2e7d5d94')]
n=7 mmr_size=11 root=5b72738d4f0581752327a48be16dae227da624f7e0316b39f512f1f787fbdb64
  0 [('node', 'right', 'f158535bbffb524797d1a34a9dc6b59281f7e5eafacfef8ab9bbbda2a97d0be5'), ('node', 'right', '093480f00e08134da4e5aabcb1034e154800e07f9db0888a9631fca322aa3c95'), ('bag', 'right', '46fd3d1a890b0a08d21c605536a42e5759f98504c92344a8225e12b4fa709d0e')]
  1 [('node', 'left', '60499eb380feaca0c5b5385982e20abe3b4b3ef7ff5037dfad344b5f8a802c7b'), ('node', 'right', '093480f00e08134da4e5aabcb1034e154800e07f9db0888a9631fca322aa3c95'), ('bag', 'right', '46fd3d1a890b0a08d21c605536a42e5759f98504c92344a8225e12b4fa709d0e')]
  2 [('node', 'right', 'ae0a16419db8f57ecc730b1fcd8c2957637e5a5dbd83078960759a9b9bf8b637'), ('node', 'left', 'f372742b780b1e913a79685dfa797b92716f38576d35b08840a369eafb26360c'), ('bag', 'right', '46fd3d1a890b0a08d21c605536a42e5759f98504c92344a8225e12b4fa709d0e')]
  3 [('node', 'left', '00f32b9b5d0c34bf15d666e0f470631491902efe447db7c262a1d54d3ff591c5'), ('node', 'left', 'f372742b780b1e913a79685dfa797b92716f38576d35b08840a369eafb26360c'), ('bag', 'right', '46fd3d1a890b0a08d21c605536a42e5759f98504c92344a8225e12b4fa709d0e')]
  4 [('node', 'right', 'e88886ac2cabaacbc23f315a0fd46f93fc3525d0436fe39ea701d5676b789ba6'), ('bag', 'right', 'fbb0dc973121b4536952de0370b3dfd5cc1eb45c432d8b7c33e8142cc9fb91ed'), ('bag', 'left', 'ff55b1c86c203cbc5c84a79803d4f921e317a8e72c0645535db4c1cc2e7d5d94')]
  5 [('node', 'left', '014486f26ca863608c1ffb242275bbcbcf1479a662124e631d1719a0b795f71a'), ('bag', 'right', 'fbb0dc973121b4536952de0370b3dfd5cc1eb45c432d8b7c33e8142cc9fb91ed'), ('bag', 'left', 'ff55b1c86c203cbc5c84a79803d4f921e317a8e72c0645535db4c1cc2e7d5d94')]
  6 [('bag', 'left', '3e405514d5bd48d670e457b92c484d3f6089cb692472e9c2ffc6a68415ba1543'), ('bag', 'left', 'ff55b1c86c203cbc5c84a79803d4f921e317a8e72c0645535db4c1cc2e7d5d94')]
```

The Python reference generator imports no Arkhe Rust/WASM implementation.
Its BLAKE3 implementation self-checks against the empty-input and `abc`
known-answer values before generating MMR outputs.

This establishes **ReferenceVectorGeneration = EXECUTED/PASSED** for the
profile and committed JSON. It does **not** establish Native/WASM parity.
That remains a separate gate to execute inside the Arkhe repository with the
real native and WASM adapters.
