import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Text, Billboard } from '@react-three/drei';
import { DiagramElement, MetaClass, Model } from '../../models/types';
import { appearanceService, mmToPixel } from '../../services/appearance.service';
import ShapeIndicator3D from './ShapeIndicator3D';

// Represents a 3D element with position and rotation information
export interface Element3D extends DiagramElement {
  rotationZ?: number;
  // New optional dimensions in mm
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  // 3D specific coordinates - won't affect 2D mode
  position3D?: { x: number, y: number };
}

interface Node3DProps {
  element: Element3D;
  model?: Model | null;
  onClick: () => void;
  onDragStart?: (event: any) => void;
  selected: boolean;
  metaClass: MetaClass;
  lowPerformance: boolean;
  renderOrder?: number; // Add render order prop for z-sorting
  isDragging?: boolean;
}

/**
 * Component for a 3D node element with consistent appearance matching 2D view
 */
const Node3D = forwardRef<THREE.Group, Node3DProps>(({
  element,
  model,
  onClick,
  onDragStart,
  selected,
  metaClass,
  lowPerformance,
  renderOrder = 0,
  isDragging = false
}, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const [loadedModel, setLoadedModel] = useState<THREE.Group | null>(null);
  const [modelLoading, setModelLoading] = useState(false);

  // Get appearance settings from the shared service
  const appearance = appearanceService.getAppearanceSettings(element, model);
  const shapeType = appearance.shape || 'rectangle';
  
  // Get dimensions from style first (for persistence) or fallback to direct props
  const widthMm = element.style.widthMm || element.widthMm || appearance.widthMm || 500; // Default length in mm (Z-axis)
  const heightMm = element.style.heightMm || element.heightMm || appearance.heightMm || 800; // Default width in mm (X-axis)
  const depthMm = element.style.depthMm || element.depthMm || (lowPerformance ? 100 : 200);
  
  // Apply rotation (in radians)
  const rotationZ = ((element.rotationZ || 0) * Math.PI) / 180;

  // Load 3D model if needed - using shared model instances
  useEffect(() => {
    if (shapeType === 'custom-3d-model' && !lowPerformance) {
      const loadModelData = async () => {
        try {
          setModelLoading(true);
          const modelData = await appearanceService.getModelData(element, model);
          
          if (modelData) {
            try {
              // Use the appearance service's shared model loading with caching
              const sharedModel = await appearanceService.loadModel(modelData);
              
              // Clone the shared model for this instance to avoid shared state issues
              const instanceModel = sharedModel.clone();
              
              // Ensure materials are properly cloned and visible
              instanceModel.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  // Clone the material to avoid shared state issues
                  if (child.material) {
                    child.material = child.material.clone();
                  }
                  // Ensure the mesh is visible
                  child.visible = true;
                  child.castShadow = true;
                  child.receiveShadow = !lowPerformance;
                }
              });
              
              // Get the original model's bounding box for proper scaling
              const originalBox = new THREE.Box3().setFromObject(instanceModel);
              const originalSize = originalBox.getSize(new THREE.Vector3());
              const originalCenter = originalBox.getCenter(new THREE.Vector3());
              
              // Center the model first
              instanceModel.position.sub(originalCenter);
              
              // Convert element dimensions from mm to Three.js units
              const targetWidth = widthMm * mmToPixel(1);
              const targetHeight = heightMm * mmToPixel(1);  
              const targetDepth = depthMm * mmToPixel(1);
              
              // Calculate scale factors to exactly match target dimensions
              const scaleX = originalSize.x > 0 ? targetWidth / originalSize.x : 1;
              const scaleY = originalSize.y > 0 ? targetDepth / originalSize.y : 1;
              const scaleZ = originalSize.z > 0 ? targetHeight / originalSize.z : 1;
              
              // Apply scaling to match target dimensions
              instanceModel.scale.set(scaleX, scaleY, scaleZ);
              
              // After scaling, adjust position so the bottom of the model sits at Y=0
              const scaledBox = new THREE.Box3().setFromObject(instanceModel);
              const scaledMin = scaledBox.min;
              
              // Move the model up so its bottom is at Y=0 (sits on the grid)
              instanceModel.position.y -= scaledMin.y;
              
              setLoadedModel(instanceModel);
              setModelLoading(false);
            } catch (error) {
              console.error('Error loading shared GLB model:', error);
              setLoadedModel(null);
              setModelLoading(false);
            }
          } else {
            setLoadedModel(null);
            setModelLoading(false);
          }
        } catch (error) {
          console.error('Failed to load 3D model:', error);
          setLoadedModel(null);
          setModelLoading(false);
        }
      };

      loadModelData();
    } else {
      setLoadedModel(null);
    }
  }, [shapeType, element, model, widthMm, heightMm, depthMm, lowPerformance]);

  // Expose groupRef to parent when this element is selected
  useImperativeHandle(ref, () => groupRef.current as THREE.Group, []);

  // Set render order for proper z-sorting
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.renderOrder = renderOrder;
      
      if (selected) {
        // Selected elements always render on top
        meshRef.current.renderOrder = 1000;
      }
    }
  }, [renderOrder, selected]);

  // Enhanced click handling with drag support
  const handleClick = useCallback((e: any) => {
    e.stopPropagation();
    e.nativeEvent?.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();
    
    // Only handle clicks if we're not in the middle of dragging
    if (!isDragging && e.object && (e.object === meshRef.current || e.object.parent === groupRef.current)) {
      onClick();
    }
  }, [onClick, isDragging]);

  // Enhanced pointer down handling for drag initiation
  const handlePointerDown = useCallback((e: any) => {
    e.stopPropagation();
    e.nativeEvent?.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();
    
    if (lowPerformance) return;
    
    // Verify this is a genuine click on our element
    if (e.object && (e.object === meshRef.current || e.object.parent === groupRef.current)) {
      // Only select if not already selected
      if (!selected) {
        onClick();
      }
      
      // Start drag if we have a drag handler and element is selected
      // Pass the original mouse event with clientX/clientY coordinates
      if (selected && onDragStart) {
        const mouseEvent = {
          clientX: e.nativeEvent?.clientX || 0,
          clientY: e.nativeEvent?.clientY || 0,
          preventDefault: () => e.nativeEvent?.preventDefault?.(),
          stopPropagation: () => e.stopPropagation()
        };
        onDragStart(mouseEvent);
      }
    }
  }, [lowPerformance, onClick, selected, onDragStart]);
  
  const handlePointerMove = useCallback((e: any) => {
    // Drag movement is handled globally
  }, []);
  
  const handlePointerUp = useCallback((e: any) => {
    e.stopPropagation();
    e.nativeEvent?.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();
  }, []);
  
  // Get the geometry for this element based on shape type
  const geometry = React.useMemo(() => {
    return appearanceService.getGeometry(element, model, lowPerformance);
  }, [element, model, lowPerformance, widthMm, heightMm, depthMm, shapeType]);
  
  // Get the material for this element
  const material = React.useMemo(() => {
    return appearanceService.getMaterial(element, model, selected, hover, lowPerformance);
  }, [element, model, selected, hover, lowPerformance]);
  
  // Get element name
  const elementName = element.style.name || metaClass.name || 'Unnamed';

  // Calculate position adjustments for different shapes to ensure proper separation from plane
  const positionAdjustment: [number, number, number] = React.useMemo(() => {
    const halfDepth = (depthMm * mmToPixel(1)) * 0.5;
    
    // Add a small offset above the plane to prevent raycasting conflicts at certain camera angles
    const planeOffset = 2; // Small offset to ensure elements are clearly above the plane
    
    // For custom 3D models, position them so they sit on the grid (not centered)
    if (shapeType === 'custom-3d-model') {
      return [0, halfDepth + planeOffset, 0]; // Position so bottom sits on grid
    }
    
    switch (shapeType) {
      case 'cylinder':
        return [0, halfDepth + planeOffset, 0]; // Center the cylinder above plane
      case 'sphere':
        return [0, halfDepth + planeOffset, 0]; // Center the sphere above plane
      case 'cone':
        return [0, halfDepth + planeOffset, 0]; // Center the cone above plane
      case 'rectangle':
      default:
        return [0, halfDepth + planeOffset, 0]; // Center the box above plane
    }
  }, [shapeType, depthMm]);

  // Calculate text positioning
  const textPosition: [number, number, number] = React.useMemo(() => {
    const textOffset = 50; // Offset from the object in mm
    const halfWidth = (heightMm * mmToPixel(1)) * 0.5; // Use heightMm for X-axis width
    const halfDepth = (depthMm * mmToPixel(1)) * 0.5;
    
    // Position text to the right side of the object (X-axis)
    return [halfWidth + textOffset, halfDepth, 0];
  }, [heightMm, depthMm]);

  // Calculate text size based on element size
  const textSize = React.useMemo(() => {
    const baseSize = Math.max(heightMm, widthMm) * 0.1; // Base size proportional to element (heightMm for X-axis, widthMm for Z-axis)
    return {
      nameSize: Math.max(Math.min(baseSize, 80), 20), // Clamp between 20 and 80
    };
  }, [heightMm, widthMm]);
  
  return (
    <group
      ref={groupRef}
      position={[
        element.style.position3D?.x ?? element.position3D?.x ?? element.x ?? 0, 
        0, 
        -(element.style.position3D?.y ?? element.position3D?.y ?? element.y ?? 0) // Negate Y to fix mirroring
      ]}
      rotation={[0, rotationZ, 0]}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Conditionally render either standard geometry or custom 3D model */}
      {shapeType === 'custom-3d-model' && loadedModel ? (
        // Render custom 3D model - no position adjustment needed since model is already positioned correctly
        <group
          position={[0, 0, 0]} // No position adjustment for GLB models
          onClick={handleClick}
          onPointerOver={() => !lowPerformance && setHover(true)}
          onPointerOut={() => !lowPerformance && setHover(false)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <primitive 
            object={loadedModel} 
            castShadow 
            receiveShadow={!lowPerformance}
          />
        </group>
      ) : (
        // Render standard geometry
        <mesh
          ref={meshRef}
          position={positionAdjustment}
          onClick={handleClick}
          onPointerOver={() => !lowPerformance && setHover(true)}
          onPointerOut={() => !lowPerformance && setHover(false)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          castShadow
          receiveShadow={!lowPerformance}
        >
          {/* Use geometry from appearance service */}
          <primitive object={geometry} attach="geometry" />
          <primitive object={material} attach="material" />
        </mesh>
      )}
      
      {/* Selection indicator - wireframe outline */}
      {selected && (
        <mesh position={positionAdjustment}>
          <primitive object={geometry} attach="geometry" />
          <meshBasicMaterial 
            color="#00ff00" 
            wireframe={true} 
            wireframeLinewidth={3}
            transparent={true}
            opacity={0.8}
          />
        </mesh>
      )}
      
      {/* Selection indicator - bounding box edges */}
      {selected && !lowPerformance && (
        <group position={positionAdjustment}>
          <lineSegments>
            <edgesGeometry args={[geometry]} />
            <lineBasicMaterial color="#00ff00" linewidth={2} />
          </lineSegments>
        </group>
      )}
      
      {/* Hover indicator */}
      {hover && !selected && !lowPerformance && (
        <mesh position={positionAdjustment}>
          <primitive object={geometry} attach="geometry" />
          <meshBasicMaterial 
            color="#ffff00" 
            wireframe={true} 
            transparent={true}
            opacity={0.3}
          />
        </mesh>
      )}
      
      {/* Add shape indicator on top for better recognition */}
      {!lowPerformance && (
        <ShapeIndicator3D 
          element={element} 
          model={model}
          lowPerformance={lowPerformance}
          position={[0, depthMm * mmToPixel(1) * 0.5 + 5, 0]}
          scale={0.8}
        />
      )}
      
      {/* Element name - displayed on the side with billboard effect */}
      <Billboard
        position={textPosition}
        follow={true} // Always face the camera
      >
        <Text
          fontSize={selected ? textSize.nameSize * 1.2 : textSize.nameSize}
          color={selected ? "#00ff00" : (appearance.fontColor || "#000000")}
          anchorX="center" // Center-align text for consistent appearance on both sides
          anchorY="middle"
          maxWidth={300}
          outlineWidth={selected ? 2 : 0}
          outlineColor={selected ? "#000000" : "transparent"}
        >
          {elementName}
        </Text>
      </Billboard>
      
      {/* Selection glow effect - larger transparent version behind the element */}
      {selected && !lowPerformance && (
        <mesh position={[positionAdjustment[0], positionAdjustment[1], positionAdjustment[2]]}>
          <primitive 
            object={geometry.clone().scale(1.05, 1.05, 1.05)} 
            attach="geometry" 
          />
          <meshBasicMaterial 
            color="#00ff00" 
            transparent={true}
            opacity={0.2}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
});

export default Node3D; 