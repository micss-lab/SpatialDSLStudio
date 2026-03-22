import { useState, useEffect, useCallback } from 'react';
import { DiagramElement } from '../../../../models/types';
import { fileStorageService } from '../../../../services/core';

export type AppearanceOption = 
  | 'default' 
  | 'square' 
  | 'rectangle' 
  | 'circle' 
  | 'triangle' 
  | 'star' 
  | 'custom-image'
  | 'custom-3d-model';

export interface AppearanceConfig {
  type: AppearanceOption;
  imageUrl?: string;
  imageSrc?: string;
  imageFileId?: string;
  modelUrl?: string;
  modelSrc?: string;
  modelFileId?: string;
  color?: string;
  shape?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface UseAppearanceStateProps {
  element: DiagramElement;
  onChange: (propertyName: string, value: any) => void;
}

export interface UseAppearanceStateReturn {
  appearanceType: AppearanceOption;
  imageUrl: string;
  imageSrc: string | null;
  imageFileId: string | null;
  modelUrl: string;
  modelSrc: string | null;
  modelFileId: string | null;
  color: string;
  setAppearanceType: React.Dispatch<React.SetStateAction<AppearanceOption>>;
  setImageUrl: React.Dispatch<React.SetStateAction<string>>;
  setImageSrc: React.Dispatch<React.SetStateAction<string | null>>;
  setImageFileId: React.Dispatch<React.SetStateAction<string | null>>;
  setModelUrl: React.Dispatch<React.SetStateAction<string>>;
  setModelSrc: React.Dispatch<React.SetStateAction<string | null>>;
  setModelFileId: React.Dispatch<React.SetStateAction<string | null>>;
  setColor: React.Dispatch<React.SetStateAction<string>>;
  updateAppearance: (
    type: AppearanceOption,
    url: string,
    src: string | null,
    imgFileId: string | null,
    mUrl: string,
    mSrc: string | null,
    mdlFileId: string | null,
    color: string
  ) => void;
  clearImage: () => Promise<void>;
  clearModel: () => Promise<void>;
}

export const useAppearanceState = ({
  element,
  onChange
}: UseAppearanceStateProps): UseAppearanceStateReturn => {
  const [appearanceType, setAppearanceType] = useState<AppearanceOption>('default');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFileId, setImageFileId] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string>('');
  const [modelSrc, setModelSrc] = useState<string | null>(null);
  const [modelFileId, setModelFileId] = useState<string | null>(null);
  const [color, setColor] = useState<string>('#ffffff');

  // Initialize from element style
  useEffect(() => {
    const initializeAppearance = async () => {
      if (element.style.appearance) {
        try {
          const appearance = JSON.parse(element.style.appearance);
          setAppearanceType(appearance.type || 'default');
          setImageUrl(appearance.imageUrl || '');
          setImageSrc(appearance.imageSrc || null);
          setModelUrl(appearance.modelUrl || '');
          setModelSrc(appearance.modelSrc || null);
          setColor(appearance.color || '#ffffff');

          // Handle stored file IDs
          if (appearance.imageFileId) {
            setImageFileId(appearance.imageFileId);
            try {
              const imageData = await fileStorageService.getFile(appearance.imageFileId);
              if (imageData) {
                setImageSrc(imageData);
              }
            } catch (error) {
              console.error('Error loading stored image:', error);
              setImageFileId(null);
            }
          } else {
            setImageFileId(null);
          }

          if (appearance.modelFileId) {
            setModelFileId(appearance.modelFileId);
            try {
              const modelData = await fileStorageService.getFile(appearance.modelFileId);
              if (modelData) {
                setModelSrc(modelData);
              }
            } catch (error) {
              console.error('Error loading stored model:', error);
              setModelFileId(null);
            }
          } else {
            setModelFileId(null);
          }
        } catch (e) {
          console.error('Error parsing appearance JSON:', e);
        }
      } else {
        setAppearanceType('default');
        setImageUrl('');
        setImageSrc(null);
        setImageFileId(null);
        setModelUrl('');
        setModelSrc(null);
        setModelFileId(null);
        setColor('#ffffff');
      }
    };

    initializeAppearance();
  }, [element.style.appearance]);

  // Update the appearance in the element style
  const updateAppearance = useCallback((
    type: AppearanceOption,
    url: string,
    src: string | null,
    imgFileId: string | null,
    mUrl: string,
    mSrc: string | null,
    mdlFileId: string | null,
    color: string
  ) => {
    const shape = type;

    const appearance: AppearanceConfig = {
      type,
      shape,
      color,
      fillColor: color,
      strokeColor: 'black',
      strokeWidth: 1
    };

    // Only include imageUrl or imageSrc if they're defined
    if (url) appearance.imageUrl = url;
    if (src) appearance.imageSrc = src;
    if (imgFileId) appearance.imageFileId = imgFileId;

    // Only include modelUrl or modelSrc if they're defined
    if (mUrl) appearance.modelUrl = mUrl;
    if (mSrc) appearance.modelSrc = mSrc;
    if (mdlFileId) appearance.modelFileId = mdlFileId;

    // Convert to JSON string and save to element style
    onChange('appearance', JSON.stringify(appearance));
  }, [onChange]);

  // Clear image
  const clearImage = useCallback(async () => {
    if (imageFileId) {
      try {
        await fileStorageService.deleteFile(imageFileId);
      } catch (error) {
        console.error('Error deleting stored image:', error);
      }
    }

    setImageSrc(null);
    setImageUrl('');
    setImageFileId(null);
    updateAppearance(appearanceType, '', null, null, modelUrl, modelSrc, modelFileId, color);
  }, [imageFileId, appearanceType, modelUrl, modelSrc, modelFileId, color, updateAppearance]);

  // Clear model
  const clearModel = useCallback(async () => {
    if (modelFileId) {
      try {
        await fileStorageService.deleteFile(modelFileId);
      } catch (error) {
        console.error('Error deleting stored model:', error);
      }
    }

    setModelSrc(null);
    setModelUrl('');
    setModelFileId(null);
    updateAppearance(appearanceType, imageUrl, imageSrc, imageFileId, '', null, null, color);
  }, [modelFileId, appearanceType, imageUrl, imageSrc, imageFileId, color, updateAppearance]);

  return {
    appearanceType,
    imageUrl,
    imageSrc,
    imageFileId,
    modelUrl,
    modelSrc,
    modelFileId,
    color,
    setAppearanceType,
    setImageUrl,
    setImageSrc,
    setImageFileId,
    setModelUrl,
    setModelSrc,
    setModelFileId,
    setColor,
    updateAppearance,
    clearImage,
    clearModel,
  };
};
