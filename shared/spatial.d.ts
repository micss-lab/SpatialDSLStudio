import { ModelElement, ModelElementPresentation, Position3D, Size3D } from './types';
export type LegacyPosition3D = Omit<Position3D, 'z'> & {
    z?: number;
};
export declare const isFiniteNumber: (value: unknown) => value is number;
export declare function validateVerticalPlacement3D(value: unknown, path?: string): string[];
export declare function validateConcreteSyntaxVerticalPlacement(value: unknown, path?: string): string[];
export declare function validateConcreteSyntaxMapVerticalPlacements(value: unknown, path?: string): string[];
export declare function normalizePosition3D(value: unknown): Position3D | undefined;
export declare function normalizePresentation<T extends ModelElementPresentation | undefined>(presentation: T): T;
export declare function normalizeModelElementSpatial(element: ModelElement): ModelElement;
export declare function domainToRenderPosition(position: Position3D): [number, number, number];
export declare function renderToDomainPosition(position: {
    x: number;
    y: number;
    z: number;
}): Position3D;
export declare function axisExtents(size: Size3D): {
    x: number;
    y: number;
    z: number;
};
export declare function domainExtentsToRender(size: Size3D): [number, number, number];
export declare function baseCenterMeters(baseZMm: number, verticalExtentMm: number): number;
export declare function validatePosition3D(value: unknown, path?: string): string[];
export declare function validatePresentation(value: unknown, path?: string): string[];
