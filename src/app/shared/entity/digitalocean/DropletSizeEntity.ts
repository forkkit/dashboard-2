export interface Size {
  slug: string;
  memory: number;
  vcpus: number;
  disk: number;
  transfer: number;
  price_monthly: number;
  price_hourly: number;
  regions: string[];
  available: boolean;
}

export interface Links {
}

export interface Meta {
  total: number;
}

export interface DropletSizeResponseEntity {
  sizes: Size[];
  links: Links;
  meta: Meta;
}