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
- `elementsByClassName.WarehouseController`
- `elementsByClassName.Task`
- `elementsByClassName.Product`
- `countByClassName.*`
- `WarehouseModel.WarehouseMAS`
- `WarehouseModel["Mobile Robot Resource"]`
- 3D placement fields: `X`, `Y`, `Z`, `BaseElevationMm`, `RZ`, `Length`,
  `Width`, `Height`
- stable generated identifiers such as `opcNodeId`, `controlId`, `taskId`, and
  `productId`
- `resolvedReferences.<referenceName>` target summaries (ID, name, class, and
  stable OPC/control identifier), while the original raw reference IDs remain
  available for backwards compatibility

## What The Project Generates

The importable project contains eight templates:

- `SimulationScript.py`: Visual Components setup script.
- `Config.java`: JADE/MAS configuration, including model-driven controller,
  task, and product records.
- `PathwayAreaLocation.json`: pathway area placement and dimensions.
- `RobotLocation.json`: mobile robot placement.
- `ConveyorLocation.json`: conveyor placement.
- `OutputLocation.json`: output location placement.
- `ChargingStationLocation.json`: charging station placement.
- `OPCUAConfig.xml`: OPC UA connectivity configuration.

The Smart Warehouse model now also contains `InspectionDrone` elements. The
Visual Components templates intentionally do not iterate that class, so their
eight-file output remains unchanged; aerial control is outside this target.

The code generation UI supports `java`, `python`, `json`, `xml`, and `plaintext`
template content types. The five location templates are tagged `json` and the
connectivity template is tagged `xml`, so each template's content type now
matches the file it produces. `MASConfig` stays `java` and `SimulationScript`
stays `python`.

The OPC UA template reads `OpcuaServerPort`, `NamespaceURI`, and `ApplicationURI`
from the `WarehouseMAS` model element. The application URI is a model attribute
(`ApplicationURI`, defaulting to `urn:localhost:4840/WarehouseMAS`) rather than a
hard-coded string. If your OPC UA server advertises a different application URI,
edit `ApplicationURI` on the `WarehouseMAS` element in the model before
generating, instead of editing the template.

`Config.java` no longer hard-codes only a coordinator. It generates
`ControllerSpec`, `TaskSpec`, and `ProductSpec` records from the model. A task's
assigned robot, pickup, and dropoff are resolved by semantic reference, so the
generated source contains stable names such as `Robot1`, `Conveyor`, and
`Output Location` instead of opaque element UUIDs. Controller policy,
update interval, controlled robots, and monitored conveyors are emitted the same
way.

The connectivity XML and Java constants share the Isaac Sim bridge contract:

```text
Robot{n}/Location
Robot{n}/Target
Robot{n}/State
Robot{n}/HasProduct
Robot{n}/BatteryLevel
```

`SimulationScript.py` creates the corresponding `State` property, and
`OPCUAConfig.xml` maps it in the server-to-simulation group. Stable robot numbering
comes from deterministic generation ordering, so controller/task references and
OPC XML address the same agents.

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
