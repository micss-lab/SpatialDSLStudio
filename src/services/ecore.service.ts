import { Metamodel, MetaClass, MetaAttribute, MetaReference } from '../models/types';
import { metamodelService } from './metamodel.service';
import { v4 as uuidv4 } from 'uuid';

class EcoreService {
  /**
   * Convert a metamodel to Ecore XMI format
   * @param metamodelId The ID of the metamodel to convert
   * @returns Ecore XMI content as string, or null if conversion failed
   */
  metamodelToEcore(metamodelId: string): string | null {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with ID ${metamodelId} not found`);
      return null;
    }

    try {
      // Create the XML header and ecore namespace declarations
      let ecoreContent = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" 
  xmlns:xmi="http://www.omg.org/XMI" 
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" 
  name="${this.escapeXml(metamodel.name)}" 
  nsPrefix="${this.escapeXml(metamodel.prefix)}" 
  nsURI="${this.escapeXml(metamodel.uri)}">`;

      // Add EClasses
      for (const metaclass of metamodel.classes) {
        ecoreContent += this.generateEClassXml(metaclass, metamodel);
      }

      // Close EPackage
      ecoreContent += '\n</ecore:EPackage>';

      return ecoreContent;
    } catch (error) {
      console.error('Error converting metamodel to Ecore:', error);
      return null;
    }
  }

  /**
   * Generate XML for an EClass
   */
  private generateEClassXml(metaclass: MetaClass, metamodel: Metamodel): string {
    // Start EClass with basic attributes
    let eClassXml = `\n  <eClassifiers xsi:type="ecore:EClass" name="${this.escapeXml(metaclass.name)}"${metaclass.abstract ? ' abstract="true"' : ''}>`;

    // Add supertype references if any
    if (metaclass.superTypes && metaclass.superTypes.length > 0) {
      const supertypeRefs = metaclass.superTypes
        .map(supertypeId => {
          const supertype = metamodel.classes.find(c => c.id === supertypeId);
          if (supertype) {
            return `\n    <eSuperTypes href="#//${this.escapeXml(supertype.name)}"/>`;
          }
          return '';
        })
        .join('');
      eClassXml += supertypeRefs;
    }

    // Add attributes (EAttributes)
    for (const attribute of metaclass.attributes) {
      // Skip 'name' attribute as it's already handled by Ecore
      if (attribute.name !== 'name') {
        eClassXml += this.generateEAttributeXml(attribute);
      }
    }

    // Add references (EReferences)
    for (const reference of metaclass.references) {
      eClassXml += this.generateEReferenceXml(reference, metamodel);
    }

    // Close EClass
    eClassXml += '\n  </eClassifiers>';

    return eClassXml;
  }

  /**
   * Generate XML for an EAttribute
   */
  private generateEAttributeXml(attribute: MetaAttribute): string {
    // Map internal types to Ecore types
    const typeMap: Record<string, string> = {
      'string': 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString',
      'number': 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EDouble',
      'boolean': 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean',
      'date': 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EDate'
    };

    const ecoreType = typeMap[attribute.type] || typeMap['string'];
    
    // Generate attribute XML
    return `\n    <eStructuralFeatures xsi:type="ecore:EAttribute" name="${this.escapeXml(attribute.name)}" 
      eType="${ecoreType}"${attribute.many ? ' upperBound="-1"' : ''}${attribute.required ? ' lowerBound="1"' : ''}>
    </eStructuralFeatures>`;
  }

  /**
   * Generate XML for an EReference
   */
  private generateEReferenceXml(reference: MetaReference, metamodel: Metamodel): string {
    // Find target class
    const targetClass = metamodel.classes.find(c => c.id === reference.target);
    if (!targetClass) {
      console.warn(`Target class with ID ${reference.target} not found for reference ${reference.name}`);
      return '';
    }

    // Calculate upperBound and lowerBound
    let upperBound = '';
    let lowerBound = '';
    
    if (reference.cardinality) {
      if (reference.cardinality.upperBound === '*') {
        upperBound = ' upperBound="-1"';
      } else if (typeof reference.cardinality.upperBound === 'number') {
        upperBound = ` upperBound="${reference.cardinality.upperBound}"`;
      }
      
      if (reference.cardinality.lowerBound > 0) {
        lowerBound = ` lowerBound="${reference.cardinality.lowerBound}"`;
      }
    }

    // Generate reference XML
    return `\n    <eStructuralFeatures xsi:type="ecore:EReference" name="${this.escapeXml(reference.name)}" 
      eType="#//${this.escapeXml(targetClass.name)}"${upperBound}${lowerBound} 
      containment="${reference.containment}">
    </eStructuralFeatures>`;
  }

  /**
   * Import a metamodel from Ecore XMI content
   * @param ecoreContent Ecore XMI content
   * @returns The ID of the created metamodel, or null if import failed
   */
  importFromEcore(ecoreContent: string): string | null {
    try {
      // Create a DOMParser to parse the XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(ecoreContent, "text/xml");
      
      // Check for parse errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        console.error('Error parsing Ecore XML:', parserError.textContent);
        return null;
      }
      
      // Get the root EPackage
      const ePackage = xmlDoc.querySelector('ecore\\:EPackage, EPackage');
      if (!ePackage) {
        console.error('No EPackage found in Ecore content');
        return null;
      }
      
      // Extract package attributes
      const packageName = ePackage.getAttribute('name') || 'ImportedMetamodel';
      const nsPrefix = ePackage.getAttribute('nsPrefix') || packageName.toLowerCase();
      const nsURI = ePackage.getAttribute('nsURI') || `http://www.modeling-tool.com/${packageName.toLowerCase()}`;
      
      // Create the metamodel
      const newMetamodel = metamodelService.createMetamodel(packageName);
      if (!newMetamodel) {
        console.error('Failed to create metamodel');
        return null;
      }
      
      // Update URI and prefix
      const updatedMetamodel = {
        ...newMetamodel,
        uri: nsURI,
        prefix: nsPrefix
      };
      metamodelService.updateMetamodel(newMetamodel.id, updatedMetamodel);
      
      // First pass: Create all EClasses
      const classMap: Record<string, string> = {}; // Map class names to IDs
      
      // Iterate through all EClass elements
      const eClasses = xmlDoc.querySelectorAll('eClassifiers[xsi\\:type="ecore:EClass"], eClassifiers[xsi\\:type="ecore:EEnum"]');
      eClasses.forEach(eClass => {
        const className = eClass.getAttribute('name');
        const isAbstract = eClass.getAttribute('abstract') === 'true';
        
        if (className) {
          const newClass = metamodelService.addMetaClass(newMetamodel.id, className, isAbstract);
          if (newClass) {
            classMap[className] = newClass.id;
          }
        }
      });
      
      // Second pass: Process attributes and references
      eClasses.forEach(eClass => {
        const className = eClass.getAttribute('name');
        if (!className || !classMap[className]) return;
        
        const classId = classMap[className];
        
        // Process EAttributes
        const eAttributes = eClass.querySelectorAll('eStructuralFeatures[xsi\\:type="ecore:EAttribute"]');
        eAttributes.forEach(eAttribute => {
          const attributeName = eAttribute.getAttribute('name');
          if (!attributeName) return;
          
          // Determine type
          let attributeType = 'string';
          const eType = eAttribute.getAttribute('eType');
          if (eType) {
            if (eType.includes('EString')) attributeType = 'string';
            else if (eType.includes('EInt') || eType.includes('EDouble')) attributeType = 'number';
            else if (eType.includes('EBoolean')) attributeType = 'boolean';
            else if (eType.includes('EDate')) attributeType = 'date';
          }
          
          // Determine multiplicity
          const upperBound = eAttribute.getAttribute('upperBound');
          const lowerBound = eAttribute.getAttribute('lowerBound');
          const isMany = upperBound === '-1';
          const isRequired = lowerBound && parseInt(lowerBound) > 0 ? true : false;
          
          // Add the attribute
          metamodelService.addMetaAttribute(
            newMetamodel.id,
            classId,
            attributeName,
            attributeType as 'string' | 'number' | 'boolean' | 'date',
            undefined, // defaultValue
            isRequired,
            isMany
          );
        });
        
        // Process EReferences
        const eReferences = eClass.querySelectorAll('eStructuralFeatures[xsi\\:type="ecore:EReference"]');
        eReferences.forEach(eReference => {
          const referenceName = eReference.getAttribute('name');
          if (!referenceName) return;
          
          // Find target class
          const eType = eReference.getAttribute('eType');
          if (!eType) return;
          
          // Extract target class name from eType (usually in format "#//ClassName")
          const targetClassName = eType.replace('#//', '');
          if (!targetClassName || !classMap[targetClassName]) return;
          
          // Determine properties
          const isContainment = eReference.getAttribute('containment') === 'true';
          const upperBound = eReference.getAttribute('upperBound');
          const lowerBound = eReference.getAttribute('lowerBound');
          
          // Add the reference
          metamodelService.addMetaReference(
            newMetamodel.id,
            classId,
            referenceName,
            classMap[targetClassName],
            isContainment,
            lowerBound ? parseInt(lowerBound) : 0,
            upperBound === '-1' ? '*' : (upperBound ? parseInt(upperBound) : 1)
          );
        });
      });
      
      // Third pass: Process supertypes
      eClasses.forEach(eClass => {
        const className = eClass.getAttribute('name');
        if (!className || !classMap[className]) return;
        
        const classId = classMap[className];
        
        // Process ESuperTypes
        const eSuperTypes = eClass.querySelectorAll('eSuperTypes');
        const superTypeIds: string[] = [];
        
        eSuperTypes.forEach(eSuperType => {
          const href = eSuperType.getAttribute('href');
          if (href) {
            const superTypeName = href.replace('#//', '');
            if (superTypeName && classMap[superTypeName]) {
              superTypeIds.push(classMap[superTypeName]);
            }
          }
        });
        
        // Update class with supertypes if any were found
        if (superTypeIds.length > 0) {
          metamodelService.updateMetaClass(newMetamodel.id, classId, { superTypes: superTypeIds });
        }
      });
      
      return newMetamodel.id;
    } catch (error) {
      console.error('Error importing Ecore:', error);
      return null;
    }
  }

  /**
   * Download metamodel as Ecore file
   * @param metamodelId The ID of the metamodel to download
   * @returns True if download was initiated, false otherwise
   */
  downloadAsEcore(metamodelId: string): boolean {
    const ecoreContent = this.metamodelToEcore(metamodelId);
    if (!ecoreContent) return false;
    
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) return false;
    
    // Create a blob and trigger download
    const blob = new Blob([ecoreContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metamodel.name.replace(/\s+/g, '_')}.ecore`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  }

  /**
   * Convert a metamodel to XMI format
   * @param metamodelId The ID of the metamodel to convert
   * @returns XMI content as string, or null if conversion failed
   */
  metamodelToXmi(metamodelId: string): string | null {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with ID ${metamodelId} not found`);
      return null;
    }

    try {
      // Create the XML header with XMI namespace declarations
      let xmiContent = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.0" 
  xmlns:xmi="http://www.omg.org/XMI" 
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <mm:Package 
    xmlns:mm="http://www.modeling-tool.com/metamodel" 
    name="${this.escapeXml(metamodel.name)}" 
    uri="${this.escapeXml(metamodel.uri)}" 
    prefix="${this.escapeXml(metamodel.prefix)}">`;

      // Add all classes
      for (const metaclass of metamodel.classes) {
        xmiContent += `\n    <classes 
      xmi:id="${metaclass.id}" 
      name="${this.escapeXml(metaclass.name)}" 
      abstract="${metaclass.abstract}">`;

        // Add supertype references
        if (metaclass.superTypes && metaclass.superTypes.length > 0) {
          metaclass.superTypes.forEach(supertypeId => {
            xmiContent += `\n      <superTypes href="#${supertypeId}"/>`;
          });
        }

        // Add attributes
        metaclass.attributes.forEach(attr => {
          xmiContent += `\n      <attributes 
        xmi:id="${attr.id}" 
        name="${this.escapeXml(attr.name)}" 
        type="${attr.type}" 
        many="${attr.many}" 
        required="${attr.required || false}"/>`;
        });

        // Add references
        metaclass.references.forEach(ref => {
          xmiContent += `\n      <references 
        xmi:id="${ref.id}" 
        name="${this.escapeXml(ref.name)}" 
        containment="${ref.containment}" 
        lowerBound="${ref.cardinality.lowerBound}" 
        upperBound="${ref.cardinality.upperBound}">
        <target href="#${ref.target}"/>
      </references>`;
        });

        // Close class
        xmiContent += `\n    </classes>`;
      }

      // Close package
      xmiContent += `\n  </mm:Package>
</xmi:XMI>`;

      return xmiContent;
    } catch (error) {
      console.error('Error converting metamodel to XMI:', error);
      return null;
    }
  }

  /**
   * Download metamodel as XMI file
   * @param metamodelId The ID of the metamodel to download
   * @returns True if download was initiated, false otherwise
   */
  downloadAsXmi(metamodelId: string): boolean {
    const xmiContent = this.metamodelToXmi(metamodelId);
    if (!xmiContent) return false;
    
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) return false;
    
    // Create a blob and trigger download
    const blob = new Blob([xmiContent], { type: 'application/xmi+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metamodel.name.replace(/\s+/g, '_')}.xmi`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  }

  /**
   * Convert a metamodel to PlantUML format for UML Class diagram
   * @param metamodelId The ID of the metamodel to convert
   * @returns PlantUML content as string, or null if conversion failed
   */
  metamodelToUmlClassDiagram(metamodelId: string): string | null {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with ID ${metamodelId} not found`);
      return null;
    }

    try {
      // Start PlantUML content
      let plantUml = `@startuml
skinparam classAttributeIconSize 0
skinparam classFontStyle bold
skinparam classFontSize 14
skinparam classBackgroundColor #FEFECE
skinparam classStereotypeFontSize 12
skinparam packageStyle rectangle
skinparam packageFontStyle bold
skinparam packageBackgroundColor #EEEEEE

title ${metamodel.name} - Class Diagram

package "${metamodel.name}" #DDDDFF {
`;

      // Add classes
      for (const metaclass of metamodel.classes) {
        // Class definition with abstract marker if needed
        plantUml += metaclass.abstract 
          ? `  abstract class "${metaclass.name}" {\n` 
          : `  class "${metaclass.name}" {\n`;
        
        // Add attributes
        for (const attr of metaclass.attributes) {
          const required = attr.required ? ' <b>required</b>' : '';
          const many = attr.many ? '[]' : '';
          plantUml += `    ${attr.name} : ${attr.type}${many}${required}\n`;
        }
        
        plantUml += `  }\n\n`;
      }
      
      // Add inheritance relationships (supertype)
      for (const metaclass of metamodel.classes) {
        if (metaclass.superTypes && metaclass.superTypes.length > 0) {
          for (const supertypeId of metaclass.superTypes) {
            const supertype = metamodel.classes.find(c => c.id === supertypeId);
            if (supertype) {
              plantUml += `  "${supertype.name}" <|-- "${metaclass.name}"\n`;
            }
          }
        }
      }
      
      // Add reference relationships
      for (const metaclass of metamodel.classes) {
        for (const ref of metaclass.references) {
          const targetClass = metamodel.classes.find(c => c.id === ref.target);
          if (!targetClass) continue;
          
          // Format cardinality
          const srcCard = "1";
          let targetCard = ref.cardinality.upperBound === "*" 
            ? ref.cardinality.lowerBound + "..*" 
            : ref.cardinality.lowerBound + ".." + ref.cardinality.upperBound;
          
          // Use appropriate arrow based on containment
          const arrow = ref.containment ? "*--" : "-->";
          
          plantUml += `  "${metaclass.name}" ${arrow} "${targetClass.name}" : ${ref.name} ${srcCard}:${targetCard}\n`;
        }
      }
      
      // Close package and PlantUML
      plantUml += `}\n@enduml`;
      
      return plantUml;
    } catch (error) {
      console.error('Error converting metamodel to UML Class diagram:', error);
      return null;
    }
  }

  /**
   * Download metamodel as UML Class diagram
   * @param metamodelId The ID of the metamodel to download
   * @returns True if download was initiated, false otherwise
   */
  downloadAsUmlClassDiagram(metamodelId: string): boolean {
    const plantUmlContent = this.metamodelToUmlClassDiagram(metamodelId);
    if (!plantUmlContent) return false;
    
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) return false;
    
    // Create a blob and trigger download
    const blob = new Blob([plantUmlContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metamodel.name.replace(/\s+/g, '_')}_class_diagram.puml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const ecoreService = new EcoreService(); 