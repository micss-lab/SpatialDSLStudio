// Barrel export for common services
export { searchService } from './search.service';
export type { 
  SearchEntityType, 
  SearchEntry, 
  SearchResult, 
  SearchOptions 
} from './search.service';

export { sharingService } from './sharing.service';
export type {
  ResourceType,
  SharePermission,
  SharedResource,
  ShareRequest,
  AccessCheckResponse,
} from './sharing.service';
