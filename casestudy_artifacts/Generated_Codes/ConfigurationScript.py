# Import scripts from the template file
import sys, os
sys.path.append(os.path.dirname(__file__))

# Import all scripts and functions from the source file - GIVE YOUR OWN COMPUTER PATH
exec(open(r'c:\Users\umuta\Desktop\CaseStudy\VCSimulation\Simulation_Source_Script.py').read())

# SYSTEM CONFIGURATION
VISUAL_COMPONENTS_VERSIONS = ["4.10"]

VISUAL_COMPONENTS_PATH = "C:\\Users\\Public\\Documents\\Visual Components\\"

# COMPONENT CREATION CONFIGURATION
raw_components = r'''
[
    {
        "name": "Pathway Area",
        "folder": "Navigation",
        "properties": [
{
                "name": "pathwayProperties",
                "type": "string",
                "default": ""}
],
        "script": PathwayArea
    },
    {
        "name": "Conveyor",
        "folder": "Conveyors",
        "layout_name": "_Template_OutputConveyor",
        "properties": [
{
                "name": "outputconveyorProperties",
                "type": "string",
                "default": ""}
],
        "script": OutputConveyor
    },
    {
        "name": "Block Geo",
        "folder": "Basic Shapes",
        "layout_name": "Component1"
    },
    {
        "name": "Conveyor",
        "folder": "Conveyors",
        "layout_name": "_Template_InputConveyor",
        "properties": [
{
          "name": "inputconveyorQuantity",
          "type": "number",
          "default": 0},{
        "name": "inputconveyorProperties",
        "type": "string",
        "default": ""}],
        "numbered_properties": [
{
                "name_template": "produced",
                "type": "boolean",
                "default": false},{
                "name_template": "productType",
                "type": "string",
                "default": "Component"},{
                "name_template": "clonetimeInterval",
                "type": "number",
                "default": 160},{
                "name_template": "cloneCount",
                "type": "number",
                "default": 0},],
        "property_sets": 2,
        "script": InputConveyor
    },
    {
        "name": "Idle Location",
        "folder": "Navigation",
        "layout_name": "_Template_IdleLocation",
        "properties": [
{
                "name": "idleProperties",
                "type": "string",
                "default": ""}
],
        "script": IdleLocation
    },
    {
        "name": "Mobile Robot Resource",
        "folder": "Mobile Robots",
        "layout_name": "_Template_Mobile_Robot_Resource",
        "properties": [
{
                "name": "robotQuantity",
                "type": "number",
                "default": 0}
,
{
                "name": "initialPositions",
                "type": "string",
                "default": ""}
],
        "numbered_properties": [
              {
                "name_template": "location",
                "type": "string",
                "default": "initial"},              {
                "name_template": "nextLocation",
                "type": "string",
                "default": ""},              {
                "name_template": "batteryLevel",
                "type": "number",
                "default": 100},              {
                "name_template": "target",
                "type": "string",
                "default": ""},              {
                "name_template": "stop",
                "type": "boolean",
                "default": false},              {
                "name_template": "priority",
                "type": "number",
                "default": 1},              {
                "name_template": "carryingProduct",
                "type": "boolean",
                "default": false},              {
                "name_template": "carriedProduct",
                "type": "string",
                "default": ""},              {
                "name_template": "maxSpeed",
                "type": "number",
                "default": 0},                                                        ],
        "property_sets": 4,
        "script": Robot
    }
]
'''


COMPONENTS_TO_CREATE = eval(
    raw_components.replace("false", "False").replace("true", "True")
)

# Create components
app = getApplication()
for config in COMPONENTS_TO_CREATE:
    create_component(app, config)
print("Done!")
