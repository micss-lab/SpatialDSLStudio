import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import { Text, Billboard, Line } from '@react-three/drei';
import { DiagramElement, MetaClass, Metamodel, Model, Position3D, RepresentationDescription, Viewpoint } from '../../models/types';
import { appearanceService, mmToPixel } from '../../services/diagram';
import { domainToRenderPosition, normalizePosition3D } from '../../services/spatial';
import ShapeIndicator3D from './ShapeIndicator3D';

// Represents a 3D element with position and rotation information
export interface Element3D extends DiagramElement {
  rotationZ?: number;
  // New optional dimensions in mm
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  position3D?: Position3D;
}

interface Node3DProps {
  element: Element3D;
  model?: Model | null;
  metamodel?: Metamodel | null;
  representationDescription?: RepresentationDescription;
  viewpoint?: Viewpoint;
  onClick: () => void;
  onDragStart?: (event: any) => void;
  selected: boolean;
  metaClass: MetaClass;
  lowPerformance: boolean;
  renderOrder?: number; // Add render order prop for z-sorting
  isDragging?: boolean;
  validationSeverity?: 'error' | 'warning' | 'info';
}

/**
 * Component for a 3D node element with consistent appearance matching 2D view
 */
const Node3D = forwardRef<THREE.Group, Node3DProps>(({
  element,
  model,
  metamodel,
  representationDescription,
  viewpoint,
  onClick,
  onDragStart,
  selected,
  metaClass,
  lowPerformance,
  renderOrder = 0,
  isDragging = false,
  validationSeverity,
}, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const [loadedModel, setLoadedModel] = useState<THREE.Group | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [modelLoading, setModelLoading] = useState(false);

  // Get appearance settings from the shared service
  const labelAppearance = React.useMemo(
    () => appearanceService.getAppearanceSettings(element, model),
    [element, model]
  );
  const appearance = React.useMemo(
    () => appearanceService.get3DAppearanceSettings(element, model, metamodel, representationDescription, viewpoint),
    [element, metamodel, model, representationDescription, viewpoint]
  );
  const shapeType: string = (appearance.modelUrl || (appearance as any).modelSrc || appearance.modelFileId)
    ? 'custom-3d-model'
    : (appearance.fallbackShape === 'box' ? 'rectangle' : appearance.fallbackShape || 'rectangle');
  
  // Get dimensions from style first (for persistence) or fallback to direct props
  const widthMm = element.style.widthMm ?? element.widthMm ?? appearance.widthMm ?? 500;
  const heightMm = element.style.heightMm ?? element.heightMm ?? appearance.heightMm ?? 800;
  const depthMm = element.style.depthMm ?? element.depthMm ?? appearance.depthMm ?? (lowPerformance ? 100 : 200);
  const position3D = normalizePosition3D(
    element.style.position3D || element.position3D || {
      x: element.x ?? 0,
      y: element.y ?? 0,
    }
  ) || { x: 0, y: 0, z: 0 };
  
  // Apply rotation (in radians)
  const rotationZ = ((element.style.rotationZ ?? element.rotationZ ?? 0) * Math.PI) / 180;

  // Load 3D model if needed - using shared model instances
  useEffect(() => {
    if (shapeType === 'custom-3d-model' && !lowPerformance) {
      const loadModelData = async () => {
        try {
          setModelLoading(true);
          const modelData = await appearanceService.getFileData(appearance, 'model', element);
          
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
              const targetHeight = depthMm * mmToPixel(1);
              const targetDepth = heightMm * mmToPixel(1);
              
              // Calculate scale factors to exactly match target dimensions
              const scaleX = originalSize.x > 0 ? targetWidth / originalSize.x : 1;
              const scaleY = originalSize.y > 0 ? targetHeight / originalSize.y : 1;
              const scaleZ = originalSize.z > 0 ? targetDepth / originalSize.z : 1;
              
              // Apply scaling to match target dimensions
              instanceModel.scale.set(scaleX, scaleY, scaleZ);
              
              // After scaling, adjust position so the bottom of the model sits at Y=0
              const scaledBox = new THREE.Box3().setFromObject(instanceModel);
              const scaledMin = scaledBox.min;
              const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
              
              // Keep the authored pose at the footprint centre and base rather
              // than inheriting an arbitrary GLB pivot.
              instanceModel.position.x -= scaledCenter.x;
              instanceModel.position.y -= scaledMin.y;
              instanceModel.position.z -= scaledCenter.z;
              
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
  }, [shapeType, element, appearance, widthMm, heightMm, depthMm, lowPerformance]);

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
  // Width/height/depth are resolved inside the service, but retaining them as
  // dependencies refreshes geometry when representation defaults change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, model, lowPerformance, widthMm, heightMm, depthMm]);
  
  // Get the material for this element
  const material = React.useMemo(() => {
    return appearanceService.getMaterial(element, model, selected, hover, lowPerformance);
  }, [element, model, selected, hover, lowPerformance]);
  
  // Get element name
  const elementName = element.style.name || metaClass.name || 'Unnamed';

  // Calculate position adjustments for different shapes to ensure proper separation from plane
  const positionAdjustment: [number, number, number] = React.useMemo(() => {
    const halfDepth = (depthMm * mmToPixel(1)) * 0.5;
    
    return [0, halfDepth, 0];
  }, [depthMm]);

  // Calculate text positioning
  const textPosition: [number, number, number] = React.useMemo(() => {
    const textOffset = 50; // Offset from the object in mm
    const halfWidth = (widthMm * mmToPixel(1)) * 0.5;
    const halfDepth = (depthMm * mmToPixel(1)) * 0.5;
    
    // Position text to the right side of the object (X-axis)
    return [halfWidth + textOffset, halfDepth, 0];
  }, [widthMm, depthMm]);

  // Calculate text size based on element size
  const textSize = React.useMemo(() => {
    const baseSize = Math.max(heightMm, widthMm) * 0.1; // Base size proportional to element (heightMm for X-axis, widthMm for Z-axis)
    return {
      nameSize: Math.max(Math.min(baseSize, 80), 20), // Clamp between 20 and 80
    };
  }, [heightMm, widthMm]);
  const validationColor = validationSeverity === 'error'
    ? '#d32f2f'
    : validationSeverity === 'warning'
      ? '#ed6c02'
      : '#0288d1';
  
  return (
    <group
      ref={groupRef}
      position={domainToRenderPosition(position3D)}
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

      {selected && position3D.z !== 0 && !lowPerformance && (
        <group name={`elevation-cue-${element.id}`}>
          <Line
            points={[[0, 0, 0], [0, -position3D.z, 0]]}
            color="#0288d1"
            lineWidth={2}
            dashed
            dashSize={100}
            gapSize={60}
          />
          <mesh position={[0, -position3D.z + 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(50, Math.min(widthMm, heightMm) * 0.12), Math.max(70, Math.min(widthMm, heightMm) * 0.18), 32]} />
            <meshBasicMaterial color="#0288d1" transparent opacity={0.75} side={THREE.DoubleSide} />
          </mesh>
          <Billboard position={[0, Math.max(120, depthMm * 0.2), 0]} follow>
            <Text fontSize={Math.max(24, textSize.nameSize * 0.75)} color="#01579b">
              {`Base Z ${Math.round(position3D.z)} mm`}
            </Text>
          </Billboard>
        </group>
      )}

      {validationSeverity && (
        <group name={`validation-marker-${element.id}`}>
          <mesh position={positionAdjustment}>
            <primitive object={geometry} attach="geometry" />
            <meshBasicMaterial
              color={validationColor}
              wireframe={true}
              transparent={true}
              opacity={0.9}
              depthTest={false}
            />
          </mesh>
          <Billboard
            position={[
              heightMm * mmToPixel(1) * 0.5,
              depthMm * mmToPixel(1) + 15,
              0,
            ]}
            follow={true}
          >
            <Text
              fontSize={Math.max(textSize.nameSize, 28)}
              color={validationColor}
              outlineWidth={2}
              outlineColor="#ffffff"
            >
              !
            </Text>
          </Billboard>
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
          position={[0, depthMm * mmToPixel(1) + 5, 0]}
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
          color={selected ? "#00ff00" : (labelAppearance.fontColor || "#000000")}
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
