import { DiagramElement, Model } from '../../models/types';
import * as THREE from 'three';
import { fileStorageService } from '../core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { metamodelService } from '../metamodel';
import { concreteSyntaxResolver, defaultResolvedAppearance2D } from './concrete-syntax.resolver';

// Default appearance settings
export const defaultAppearance = {
  ...defaultResolvedAppearance2D
};

// Cache for loaded resources to prevent flickering and redundant loading
const textureCache = new Map<string, THREE.Texture>();
const imageCache = new Map<string, HTMLImageElement>();
const modelCache = new Map<string, THREE.Group>();
const gltfLoader = new GLTFLoader();

// Convert pixel coordinates to millimeters
export const pixelToMm = (pixels: number): number => {
  return pixels; // Use 1:1 scale - 1 pixel = 1 mm for consistent scaling
};

// Convert millimeters to pixel coordinates
export const mmToPixel = (mm: number): number => {
  return mm; // Use 1:1 scale - 1mm = 1 Three.js unit for consistent scaling
};

/**
 * Service to handle appearance settings for diagram elements
 * This provides consistent appearance between 2D and 3D views
 */
class AppearanceService {
  /**
   * Get appearance settings from a diagram element
   * @param element The diagram element
   * @param model Optional model to check for linked element appearance
   * @returns The parsed appearance settings with defaults applied
   */
  getAppearanceSettings(element: DiagramElement, model?: Model | null) {
    const metamodel = model ? metamodelService.getMetamodelById(model.conformsTo || model.metamodelId) : undefined;
    return concreteSyntaxResolver.resolveDiagramElementAppearance(element, model, metamodel);
  }

  /**
   * Get the actual image or model data URL, resolving file IDs if necessary
   * @param appearance The appearance config
   * @param type The type of data to get ('image' or 'model')
   * @param element Optional diagram element to check for bundled models based on metaclass
   * @returns Promise that resolves to the data URL or null
   */
  async getFileData(appearance: any, type: 'image' | 'model', element?: DiagramElement): Promise<string | null> {
    if (type === 'image') {
      // Check for stored file ID first
      if (appearance.imageFileId) {
        try {
          return await fileStorageService.getFile(appearance.imageFileId);
        } catch (error) {
          console.error('Error loading stored image:', error);
        }
      }
      // Fallback to inline data or URL
      return appearance.imageSrc || appearance.imageUrl || null;
    } else if (type === 'model') {
      // First, check for bundled models based on metaclass ID (priority for deployed builds)
      if (element) {
        const bundledModel = this.getBundledModelPath(element.modelElementId);
        if (bundledModel) {
          console.log('Using bundled model for metaclass:', element.modelElementId, '→', bundledModel);
          return bundledModel;
        }
      }
      
      // Then check for stored file ID in API storage (for user-uploaded models)
      if (appearance.modelFileId) {
        try {
          const storedFile = await fileStorageService.getFile(appearance.modelFileId);
          if (storedFile) {
            console.log('Using stored model from API:', appearance.modelFileId);
            return storedFile;
          }
        } catch (error) {
          console.warn('Model file ID not found in API storage:', appearance.modelFileId);
        }
      }
      
      // Fallback to inline data or URL
      return appearance.modelSrc || appearance.modelUrl || null;
    }
    
    return null;
  }

  /**
   * Get the path to a bundled 3D model based on metaclass ID
   * These are models stored in public/models folder that will be included in the build
   * @param metaClassId The metaclass ID
   * @returns The path to the bundled model or null
   */
  private getBundledModelPath(metaClassId: string): string | null {
    // Map of warehouse example metaclass IDs to their bundled models
    // In development, files in public/ are served from root
    // In production, use PUBLIC_URL prefix if set
    const publicUrl = process.env.PUBLIC_URL || '';
    const bundledModels: { [key: string]: string } = {
      'af48adbd-f9b6-4704-9039-673f1f9e11ff': `${publicUrl}/models/mobile_robot.glb`,      // MobileRobot
      '7065b3fd-5399-48db-9494-7a9101e5d2da': `${publicUrl}/models/conveyor_1.glb`,        // Conveyor
      'e6484299-0c36-40f3-b5c9-0558eede369d': `${publicUrl}/models/charging_station.glb`,  // Idle Location
      '5570868f-e935-4a1e-acc5-dcdac65ca6f9': `${publicUrl}/models/conveyor_2.glb`,        // Output Location
      '145adc45-dd1b-4fb8-8416-e1cfc70afef0': `${publicUrl}/models/pathway_area.glb`,      // Pathway Area
      '10000000-0000-4000-8000-000000000102': `${publicUrl}/models/mobile_robot.glb`,      // SmartWarehouse MobileRobot
      '10000000-0000-4000-8000-000000000103': `${publicUrl}/models/conveyor_1.glb`,        // SmartWarehouse Conveyor
      '10000000-0000-4000-8000-000000000104': `${publicUrl}/models/conveyor_2.glb`,        // SmartWarehouse OutputLocation
      '10000000-0000-4000-8000-000000000105': `${publicUrl}/models/charging_station.glb`,  // SmartWarehouse ChargingStation
      '10000000-0000-4000-8000-000000000106': `${publicUrl}/models/pathway_area.glb`       // SmartWarehouse PathwayArea
    };
    
    const path = bundledModels[metaClassId] || null;
    if (path) {
      console.log('Bundled model path for', metaClassId, ':', path);
    }
    return path;
  }

  /**
   * Get a Three.js geometry appropriate for the element's shape
   * @param element The diagram element
   * @param model Optional model to check for linked element appearance
   * @param lowPerformance Whether we're in low performance mode
   * @returns The appropriate Three.js geometry
   */
  getGeometry(element: DiagramElement, model?: Model | null, lowPerformance = false) {
    const appearance = this.getAppearanceSettings(element, model);
    const shapeType = appearance.shape || 'rectangle';
    
    // Get dimensions from element's style or use defaults
    const widthMm = element.style.widthMm || appearance.widthMm || 500; // Default length in mm (Z-axis)
    const heightMm = element.style.heightMm || appearance.heightMm || 800; // Default width in mm (X-axis)
    const depthMm = element.style.depthMm || appearance.depthMm || (lowPerformance ? 100 : 200);
    
    // Convert to scene units (which are in millimeters)
    const width = widthMm * mmToPixel(1);
    const height = heightMm * mmToPixel(1);
    const depth = depthMm * mmToPixel(1);
    
    // Choose geometry based on shape type
    switch (shapeType) {
      case 'circle':
        // Use cylinder for circles
        const radius = Math.min(width, height) / 2;
        const segments = lowPerformance ? 16 : 32;
        return new THREE.CylinderGeometry(radius, radius, depth, segments);
      
      case 'triangle':
        // Create extruded triangle shape
        const triangleShape = new THREE.Shape();
        triangleShape.moveTo(0, height);
        triangleShape.lineTo(width / 2, 0);
        triangleShape.lineTo(width, height);
        triangleShape.lineTo(0, height);
        
        const extrudeSettings = {
          steps: lowPerformance ? 1 : 2,
          depth: depth,
          bevelEnabled: false
        };
        
        return new THREE.ExtrudeGeometry(triangleShape, extrudeSettings);
      
      case 'star':
        // Create extruded star shape
        const starShape = new THREE.Shape();
        const centerX = width / 2;
        const centerY = height / 2;
        const outerRadius = Math.min(width, height) / 2;
        const innerRadius = outerRadius * 0.4;
        const points = 5;
        
        for (let i = 0; i < points * 2; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = Math.PI * 2 * i / (points * 2) - Math.PI / 2;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          
          if (i === 0) {
            starShape.moveTo(x, y);
          } else {
            starShape.lineTo(x, y);
          }
        }
        starShape.closePath();
        
        const starExtrudeSettings = {
          steps: lowPerformance ? 1 : 2,
          depth: depth,
          bevelEnabled: false
        };
        
        return new THREE.ExtrudeGeometry(starShape, starExtrudeSettings);
      
      case 'square':
        // Use box for squares with equal width and height
        const size = Math.min(width, height);
        return new THREE.BoxGeometry(size, depth, size);
        
      case 'custom-3d-model':
        // For custom 3D models, return a fallback box geometry
        // The actual model will be loaded separately and replace this geometry
        return new THREE.BoxGeometry(width, depth, height);
        
      case 'rectangle':
      default:
        // Use box for rectangles (default) - heightMm controls X-axis (width), widthMm controls Z-axis (length)
        return new THREE.BoxGeometry(height, depth, width);
    }
  }
  
  /**
   * Get a Three.js material based on element appearance
   * @param element The diagram element
   * @param model Optional model to check for linked element appearance
   * @param selected Whether the element is selected
   * @param hover Whether the element is hovered
   * @param lowPerformance Whether we're in low performance mode
   * @returns The appropriate Three.js material
   */
  getMaterial(
    element: DiagramElement, 
    model?: Model | null, 
    selected = false, 
    hover = false, 
    lowPerformance = false
  ) {
    const appearance = this.getAppearanceSettings(element, model);
    
    // Determine appropriate color
    const color = selected 
      ? '#ff9800' 
      : (hover ? '#e0e0e0' : (appearance.fillColor || appearance.color || '#f5f5f5'));
    
    // If there's a custom image, try to use it as a texture
    if (appearance.shape === 'custom-image' && (appearance.imageSrc || appearance.imageUrl) && !lowPerformance) {
      const imageUrl = appearance.imageSrc || appearance.imageUrl;
      
      if (imageUrl) {
        // Try to get from cache first
        if (textureCache.has(imageUrl)) {
          const texture = textureCache.get(imageUrl);
          return new THREE.MeshStandardMaterial({
            map: texture,
            metalness: 0.1,
            roughness: 0.7,
          });
        }
        
        // Load texture
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(imageUrl, (loadedTexture) => {
          // Store in cache
          textureCache.set(imageUrl, loadedTexture);
        });
        
        return new THREE.MeshStandardMaterial({
          map: texture,
          metalness: 0.1,
          roughness: 0.7,
        });
      }
    }
    
    // For normal shapes use standard material
    return new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.1,
      roughness: 0.7,
      wireframe: lowPerformance
    });
  }
  
  /**
   * Load an image and cache it for reuse
   * @param imageUrl The URL of the image to load
   * @returns Promise that resolves to the loaded image
   */
  async loadImage(imageUrl: string): Promise<HTMLImageElement> {
    // Check cache first
    if (imageCache.has(imageUrl)) {
      return imageCache.get(imageUrl)!;
    }
    
    // Load the image
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      
      img.onload = () => {
        imageCache.set(imageUrl, img);
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${imageUrl}`));
      };
      
      img.src = imageUrl;
    });
  }
  
  /**
   * Get a Three.js texture from an image URL
   * @param imageUrl The URL of the image to load
   * @returns Promise that resolves to the loaded texture
   */
  async getTexture(imageUrl: string): Promise<THREE.Texture> {
    // Check cache first
    if (textureCache.has(imageUrl)) {
      return textureCache.get(imageUrl)!;
    }
    
    // Load the texture
    const textureLoader = new THREE.TextureLoader();
    
    return new Promise((resolve, reject) => {
      textureLoader.load(
        imageUrl,
        (texture) => {
          textureCache.set(imageUrl, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          reject(error);
        }
      );
    });
  }

  /**
   * Load a GLB model and cache it for reuse
   * @param modelUrl The URL of the GLB model to load
   * @returns Promise that resolves to the loaded model group
   */
  async loadModel(modelUrl: string): Promise<THREE.Group> {
    // Check cache first
    if (modelCache.has(modelUrl)) {
      // Return a clone of the cached model to avoid shared state issues
      return modelCache.get(modelUrl)!.clone();
    }
    
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        modelUrl,
        (gltf) => {
          const model = gltf.scene;
          
          // Ensure materials are properly set up for visibility
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              // Ensure the mesh is visible
              child.visible = true;
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Ensure material is properly configured
              if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.transparent = false;
                child.material.opacity = 1.0;
              }
            }
          });
          
          // Cache the model without normalization - let individual components handle scaling
          modelCache.set(modelUrl, model);
          
          // Return a clone for use
          resolve(model.clone());
        },
        undefined,
        (error) => {
          console.error('Error loading GLB model:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Check if an element has a custom 3D model
   * @param element The diagram element
   * @param model Optional model to check for linked element appearance
   * @returns Whether the element uses a custom 3D model
   */
  hasCustomModel(element: DiagramElement, model?: Model | null): boolean {
    const appearance = this.getAppearanceSettings(element, model);
    return appearance.shape === 'custom-3d-model' && Boolean(appearance.modelUrl || appearance.modelSrc || appearance.modelFileId);
  }

  /**
   * Get the model URL for an element (if it has one)
   * @param element The diagram element
   * @param model Optional model to check for linked element appearance
   * @returns The model URL or undefined
   */
  getModelUrl(element: DiagramElement, model?: Model | null): string | undefined {
    const appearance = this.getAppearanceSettings(element, model);
    if (appearance.shape === 'custom-3d-model') {
      return appearance.modelUrl || appearance.modelSrc;
    }
    return undefined;
  }

  /**
   * Get 3D model data URL for an element (if applicable)
   * @param element The diagram element
   * @param model Optional model to check for linked element appearance
   * @returns Promise that resolves to the model data URL or null
   */
  async getModelData(element: DiagramElement, model?: Model | null): Promise<string | null> {
    const appearance = this.getAppearanceSettings(element, model);
    if (appearance.shape === 'custom-3d-model') {
      return await this.getFileData(appearance, 'model', element);
    }
    return null;
  }
}

export const appearanceService = new AppearanceService();
export default appearanceService;
