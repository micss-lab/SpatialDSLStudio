import { metamodelService } from './metamodel.service';
import { ecoreService } from './ecore.service';

export type ExportFormat = 'json' | 'ecore' | 'xmi' | 'uml';

class ExportService {
  /**
   * Prompt the user to select an export format and then export the metamodel
   * @param metamodelId The ID of the metamodel to export
   * @returns A promise that resolves to true if export was successful, false otherwise
   */
  async exportMetamodel(metamodelId: string): Promise<boolean> {
    const metamodel = metamodelService.getMetamodelById(metamodelId);
    if (!metamodel) {
      console.error(`Metamodel with ID ${metamodelId} not found`);
      return false;
    }

    // Prompt user to select export format
    const format = await this.promptForExportFormat(metamodel.name);
    if (!format) return false; // User canceled

    // Export based on selected format
    switch (format) {
      case 'json':
        return metamodelService.downloadMetamodelAsJson(metamodelId);
      case 'ecore':
        return ecoreService.downloadAsEcore(metamodelId);
      case 'xmi':
        return ecoreService.downloadAsXmi(metamodelId);
      case 'uml':
        return ecoreService.downloadAsUmlClassDiagram(metamodelId);
      default:
        console.error(`Unsupported export format: ${format}`);
        return false;
    }
  }

  /**
   * Prompt the user to select an export format
   * @param metamodelName The name of the metamodel (used in the dialog)
   * @returns A promise that resolves to the selected format or null if canceled
   */
  private async promptForExportFormat(metamodelName: string): Promise<ExportFormat | null> {
    return new Promise<ExportFormat | null>((resolve) => {
      // Create modal dialog
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '1000';
      
      // Create dialog content
      const dialog = document.createElement('div');
      dialog.style.backgroundColor = '#fff';
      dialog.style.borderRadius = '8px';
      dialog.style.padding = '20px';
      dialog.style.width = '500px';
      dialog.style.maxWidth = '90%';
      dialog.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
      
      const title = document.createElement('h2');
      title.textContent = `Export ${metamodelName}`;
      title.style.margin = '0 0 20px 0';
      
      const text = document.createElement('p');
      text.textContent = 'Choose export format:';
      
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.flexWrap = 'wrap';
      buttonContainer.style.justifyContent = 'space-between';
      buttonContainer.style.marginTop = '20px';
      
      const jsonButton = document.createElement('button');
      jsonButton.textContent = 'JSON';
      jsonButton.style.padding = '8px 16px';
      jsonButton.style.backgroundColor = '#4CAF50';
      jsonButton.style.color = 'white';
      jsonButton.style.border = 'none';
      jsonButton.style.borderRadius = '4px';
      jsonButton.style.cursor = 'pointer';
      jsonButton.style.fontSize = '16px';
      jsonButton.style.flex = '1';
      jsonButton.style.margin = '0 5px 10px 0';
      jsonButton.style.minWidth = '100px';
      jsonButton.onclick = () => {
        document.body.removeChild(modal);
        resolve('json');
      };
      
      const ecoreButton = document.createElement('button');
      ecoreButton.textContent = 'Ecore';
      ecoreButton.style.padding = '8px 16px';
      ecoreButton.style.backgroundColor = '#2196F3';
      ecoreButton.style.color = 'white';
      ecoreButton.style.border = 'none';
      ecoreButton.style.borderRadius = '4px';
      ecoreButton.style.cursor = 'pointer';
      ecoreButton.style.fontSize = '16px';
      ecoreButton.style.flex = '1';
      ecoreButton.style.margin = '0 5px 10px 5px';
      ecoreButton.style.minWidth = '100px';
      ecoreButton.onclick = () => {
        document.body.removeChild(modal);
        resolve('ecore');
      };
      
      const xmiButton = document.createElement('button');
      xmiButton.textContent = 'XMI';
      xmiButton.style.padding = '8px 16px';
      xmiButton.style.backgroundColor = '#673AB7';
      xmiButton.style.color = 'white';
      xmiButton.style.border = 'none';
      xmiButton.style.borderRadius = '4px';
      xmiButton.style.cursor = 'pointer';
      xmiButton.style.fontSize = '16px';
      xmiButton.style.flex = '1';
      xmiButton.style.margin = '0 0 10px 5px';
      xmiButton.style.minWidth = '100px';
      xmiButton.onclick = () => {
        document.body.removeChild(modal);
        resolve('xmi');
      };
      
      const umlButton = document.createElement('button');
      umlButton.textContent = 'UML Class';
      umlButton.style.padding = '8px 16px';
      umlButton.style.backgroundColor = '#FF9800';
      umlButton.style.color = 'white';
      umlButton.style.border = 'none';
      umlButton.style.borderRadius = '4px';
      umlButton.style.cursor = 'pointer';
      umlButton.style.fontSize = '16px';
      umlButton.style.flex = '1';
      umlButton.style.margin = '0 5px 10px 0';
      umlButton.style.minWidth = '100px';
      umlButton.onclick = () => {
        document.body.removeChild(modal);
        resolve('uml');
      };
      
      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.padding = '8px 16px';
      cancelButton.style.backgroundColor = '#f44336';
      cancelButton.style.color = 'white';
      cancelButton.style.border = 'none';
      cancelButton.style.borderRadius = '4px';
      cancelButton.style.cursor = 'pointer';
      cancelButton.style.fontSize = '16px';
      cancelButton.style.flex = '1';
      cancelButton.style.margin = '0 0 10px 5px';
      cancelButton.style.minWidth = '100px';
      cancelButton.onclick = () => {
        document.body.removeChild(modal);
        resolve(null);
      };
      
      // Assemble dialog
      buttonContainer.appendChild(jsonButton);
      buttonContainer.appendChild(ecoreButton);
      buttonContainer.appendChild(xmiButton);
      buttonContainer.appendChild(umlButton);
      buttonContainer.appendChild(cancelButton);
      
      dialog.appendChild(title);
      dialog.appendChild(text);
      dialog.appendChild(buttonContainer);
      
      modal.appendChild(dialog);
      document.body.appendChild(modal);
      
      // Close modal if clicking outside
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          document.body.removeChild(modal);
          resolve(null);
        }
      });
    });
  }
}

export const exportService = new ExportService(); 