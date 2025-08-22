import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { DiagramElement, Model } from '../../models/types';
import { appearanceService } from '../../services/appearance.service';

interface ShapeIndicator3DProps {
  element: DiagramElement;
  model?: Model | null;
  lowPerformance?: boolean;
  position?: [number, number, number];
  scale?: number;
}

/**
 * A component that creates a small shape indicator matching the 2D appearance
 * This is placed on top of 3D elements to help users identify the element type
 */
const ShapeIndicator3D: React.FC<ShapeIndicator3DProps> = ({
  element,
  model,
  lowPerformance = false,
  position = [0, 0, 0],
  scale = 1
}) => {
  const indicatorRef = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [textureLoaded, setTextureLoaded] = useState(false);
  const [textureError, setTextureError] = useState(false);
  
  const appearance = appearanceService.getAppearanceSettings(element, model);
  const shapeType = appearance.shape || 'rectangle';
  
  // Rotate the indicator slightly to make it more visible
  useFrame(() => {
    if (indicatorRef.current && !lowPerformance) {
      indicatorRef.current.rotation.y += 0.01;
    }
  });
  
  // Load texture if needed - outside the render method
  useEffect(() => {
    // Only load if it's a custom image and not in low performance mode
    if (
      shapeType === 'custom-image' && 
      !lowPerformance && 
      (appearance.imageSrc || appearance.imageUrl) &&
      !textureLoaded && 
      !textureError
    ) {
      const imageUrl = appearance.imageSrc || appearance.imageUrl;
      if (!imageUrl) return;
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        imageUrl,
        (loadedTexture) => {
          setTexture(loadedTexture);
          setTextureLoaded(true);
        },
        undefined,
        (error) => {
          console.error("Error loading texture for indicator:", error);
          setTextureError(true);
        }
      );
    }
  }, [appearance.imageSrc, appearance.imageUrl, lowPerformance, shapeType, textureLoaded, textureError]);
  
  // Use smaller size for the indicator
  const width = 10 * scale;
  const height = 10 * scale;
  const depth = 5 * scale;
  
  // Determine the appearance color
  const color = appearance.fillColor || appearance.color || '#4287f5';
  
  // Render different indicators based on shape type
  const renderShapeIndicator = () => {
    if (lowPerformance) {
      return null; // Don't render indicators in low performance mode
    }
    
    switch (shapeType) {
      case 'circle':
        return (
          <mesh position={[0, depth/2, 0]}>
            <cylinderGeometry args={[width/2, width/2, depth, 16]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      
      case 'triangle':
        const triangleShape = new THREE.Shape();
        triangleShape.moveTo(0, height);
        triangleShape.lineTo(width / 2, 0);
        triangleShape.lineTo(width, height);
        triangleShape.lineTo(0, height);
        
        const extrudeSettings = {
          steps: 1,
          depth: depth,
          bevelEnabled: false
        };
        
        return (
          <mesh position={[-width/2, depth/2, -height/2]}>
            <extrudeGeometry args={[triangleShape, extrudeSettings]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      
      case 'star':
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
          steps: 1,
          depth: depth,
          bevelEnabled: false
        };
        
        return (
          <mesh position={[-width/2, depth/2, -height/2]}>
            <extrudeGeometry args={[starShape, starExtrudeSettings]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      
      case 'square':
        return (
          <mesh position={[0, depth/2, 0]}>
            <boxGeometry args={[width, depth, width]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      
      case 'rectangle':
        return (
          <mesh position={[0, depth/2, 0]}>
            <boxGeometry args={[width, depth, height]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      
      case 'custom-image':
        // For custom image, use a plane with the texture
        if (textureLoaded && texture) {
          return (
            <mesh position={[0, depth/2, 0]}>
              <boxGeometry args={[width, depth, height]} />
              <meshStandardMaterial map={texture} />
            </mesh>
          );
        }
        
        // Fallback when no image is available or error loading
        return (
          <mesh position={[0, depth/2, 0]}>
            <boxGeometry args={[width, depth, height]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );

      case 'custom-3d-model':
        // For custom 3D models, show a wireframe indicator
        return (
          <mesh position={[0, depth/2, 0]}>
            <boxGeometry args={[width, depth, height]} />
            <meshStandardMaterial 
              color={color} 
              wireframe={true}
              transparent={true}
              opacity={0.7}
            />
          </mesh>
        );
      
      default:
        return (
          <mesh position={[0, depth/2, 0]}>
            <boxGeometry args={[width, depth, height]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
    }
  };
  
  return (
    <group 
      ref={indicatorRef} 
      position={position}
    >
      {renderShapeIndicator()}
    </group>
  );
};

export default ShapeIndicator3D; 