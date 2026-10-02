import type { Ref } from './client';

/** The subset of Order Time fields the portal reads. */

export interface OtCustomField {
  Name: string;
  Caption: string;
  Value: unknown;
}

export interface OtItem {
  Id: number;
  Name: string;
  Description: string | null;
  Price: number;
  IsActive: boolean;
  ItemGroupRef: Ref;
  UomSetRef: Ref;
  CustomFields: OtCustomField[] | null;
}

export interface OtInventoryByLocation {
  ItemRef: { Id: number; Name: string };
  LocationRef: Ref;
  Available: number;
  OnHand: number;
  ReorderPoint: number | null;
}

export interface OtPriceLevel {
  Id: number;
  Name: string;
  Type: number; // 40 = Customer Item Price, 80 = Customer Item Group Discount, 130 = Volume discount
  IsActive: boolean;
}

export interface OtLevelItemPrice {
  ItemRef: { Id: number; Name: string };
  PriceLevelRef: Ref;
  NewPrice: number;
  IsActive: boolean;
}

export interface OtSalesRep {
  Id: number;
  Name: string;
  IsActive: boolean;
}

export interface OtAddress {
  State?: string | null;
  City?: string | null;
}

export interface OtCustomer {
  Id: number;
  Name: string;
  CompanyName: string | null;
  IsActive: boolean;
  TypeRef: Ref;
  TermRef: Ref;
  SalesRepRef: Ref;
  PriceLevelRef: Ref;
  PrimaryShipAddress: OtAddress | null;
  CustomFields: OtCustomField[] | null;
}
