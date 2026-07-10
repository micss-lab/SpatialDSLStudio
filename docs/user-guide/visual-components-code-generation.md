# Visual Components Code Generation

This guide explains how to generate a Visual Components warehouse simulation
bundle from the Smart Warehouse model by importing a code generation project
JSON.

## Files

- Importable codegen project:
  `examples/codegen-projects/smart-warehouse-visual-components-project.json`
- Frontend example copy:
  `frontend/src/examples/data/smart-warehouse-project.json`
- Example source model:
  `frontend/src/examples/data/smart-warehouse-model.json`
- Example target metamodel:
  `frontend/src/examples/data/smart-warehouse-metamodel.json`

## Compatibility Notes

The older `frontend/src/examples/data/warehouse-project.json` targets the old
warehouse metamodel ID and is not directly compatible with the Smart Warehouse
model.

The Visual Components project in this guide has been ported to the Smart
Warehouse metamodel ID:

```text
10000000-0000-4000-8000-000000000100
```

It uses the current model-based code generation context:

- `elementsByClassName.MobileRobot`
- `elementsByClassName.Conveyor`
- `elementsByClassName.OutputLocation`
- `elementsByClassName.ChargingStation`
- `elementsByClassName.PathwayArea`
- `countByClassName.*`
- `WarehouseModel.WarehouseMAS`
- `WarehouseModel["Mobile Robot Resource"]`
- 3D placement fields: `X`, `Y`, `RZ`, `Length`, `Width`

## What The Project Generates

The importable project contains eight templates:

- `SimulationScript.py`: Visual Components setup script.
- `Config.java`: JADE/MAS configuration.
- `PathwayAreaLocation.json`: pathway area placement and dimensions.
- `RobotLocation.json`: mobile robot placement.
- `ConveyorLocation.json`: conveyor placement.
- `OutputLocation.json`: output location placement.
- `ChargingStationLocation.json`: charging station placement.
- `OPCUAConfig.xml`: OPC UA connectivity configuration.

The code generation UI currently supports `java` and `python` as template
language tags. The JSON and XML templates are tagged as `java` for editor
compatibility, but their output patterns still generate `.json` and `.xml`
files.

The OPC UA template reads `OpcuaServerPort` and `NamespaceURI` from the
`WarehouseMAS` model element. It defaults the server application URI to
`urn:localhost:<port>/WarehouseMAS` and leaves the private-key path unset. If
your OPC UA server advertises a different application URI, update that URI in
the imported template before loading the connectivity configuration.

## Import The Project

1. Start the app.
2. Open `Code Generation`.
3. Open the `Projects` tab.
4. Click `Import Project`.
5. Select:

   ```text
   examples/codegen-projects/smart-warehouse-visual-components-project.json
   ```

6. The imported project appears as a normal user project named:

   ```text
   Smart Warehouse Visual Components
   ```

## Generate The Files

1. In Code Generation, select:

   ```text
   Smart Warehouse Visual Components
   ```

2. Make sure the available model is the Smart Warehouse example model:

   ```text
   WarehouseModel
   ```

3. Click `Generate`.
4. Download all generated files as a ZIP.

If generation returns no files, check that the Smart Warehouse model and
metamodel are loaded and that the imported project targets the Smart Warehouse
metamodel ID.
