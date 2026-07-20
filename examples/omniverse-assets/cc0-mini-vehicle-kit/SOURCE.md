# CC0 Mini Vehicle Asset Source

This directory contains a reduced dependency set from the ASWF USD Working
Group Mini Car Kit.

- Source repository: https://github.com/usd-wg/assets
- Source subtree: `full_assets/Vehicles/USD_Mini_Car_Kit`
- Source commit: `1b91f3c464891af259d51d9ee9ee9e6c357f7079`
- License: Creative Commons Zero (CC0 1.0)
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Original models: Kenney
- USD adaptation: Robin-Yann Storm

The copied mesh, material, and texture content is unchanged except for trailing
whitespace normalization in text files. This project adds `demo_forklift.usda`,
a small composition wrapper that selects the tractor body, wide front wheels,
and black rear wheels without carrying every vehicle and wheel variant from the
upstream kit.

The model is a code-generation and USD-reference demonstrator. It is not a
production autonomous mobile robot and does not include collision, rigid-body,
articulation, sensor, or control schemas.

See `UPSTREAM_README.md` for the upstream description and credits.
