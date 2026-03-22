import { useCallback } from 'react';
import { fileStorageService } from '../../../../services/core';
import { AppearanceOption } from './useAppearanceState';

export interface UseFileUploadProps {
  setImageFileId: React.Dispatch<React.SetStateAction<string | null>>;
  setImageSrc: React.Dispatch<React.SetStateAction<string | null>>;
  setAppearanceType: React.Dispatch<React.SetStateAction<AppearanceOption>>;
  setModelFileId: React.Dispatch<React.SetStateAction<string | null>>;
  setModelSrc: React.Dispatch<React.SetStateAction<string | null>>;
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
  modelUrl: string;
  modelSrc: string | null;
  modelFileId: string | null;
  imageUrl: string;
  imageSrc: string | null;
  imageFileId: string | null;
  color: string;
}

export interface UseFileUploadReturn {
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const useFileUpload = ({
  setImageFileId,
  setImageSrc,
  setAppearanceType,
  setModelFileId,
  setModelSrc,
  updateAppearance,
  modelUrl,
  modelSrc,
  modelFileId,
  imageUrl,
  imageSrc,
  imageFileId,
  color,
}: UseFileUploadProps): UseFileUploadReturn => {
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      if (file.type.startsWith('image/')) {
        // Handle image files
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
          alert('Image file size should be less than 5MB');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          const result = e.target?.result as string;

          try {
            const fileId = await fileStorageService.storeFile(result, 'image', file.name);
            setImageFileId(fileId);
            setImageSrc(result);
            setAppearanceType('custom-image');
            updateAppearance('custom-image', '', result, fileId, modelUrl, modelSrc, modelFileId, color);
          } catch (error) {
            console.error('Error storing image file:', error);
            alert('Error storing image file. Please try again.');
          }
        };
        reader.readAsDataURL(file);
      } else if (file.name.toLowerCase().endsWith('.glb')) {
        // Handle GLB files
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
          alert('3D model file size should be less than 10MB');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          const result = e.target?.result as string;

          try {
            const fileId = await fileStorageService.storeFile(result, 'model', file.name);
            setModelFileId(fileId);
            setModelSrc(result);
            setAppearanceType('custom-3d-model');
            updateAppearance('custom-3d-model', imageUrl, imageSrc, imageFileId, '', result, fileId, color);
          } catch (error) {
            console.error('Error storing model file:', error);
            alert('Error storing model file. Please try again.');
          }
        };
        reader.readAsDataURL(file);
      } else {
        alert('Please upload an image file (PNG, JPG, SVG) or a 3D model file (.glb)');
        return;
      }
    }
  }, [
    setImageFileId,
    setImageSrc,
    setAppearanceType,
    setModelFileId,
    setModelSrc,
    updateAppearance,
    modelUrl,
    modelSrc,
    modelFileId,
    imageUrl,
    imageSrc,
    imageFileId,
    color,
  ]);

  return {
    handleFileUpload,
  };
};
