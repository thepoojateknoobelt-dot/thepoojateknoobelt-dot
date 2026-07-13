export type UserRole = string;

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  password?: string;
  permission?: 'read' | 'write';
  allowedPages?: string[];
  hasDeletionCode?: boolean;
}

export interface Rates {
  mesh: number;
  fep: number;
  thread: number;
  pin: number;
  packing: number;
}


export interface Constants {
  purchaseGst: number;
  fixCost: number;
  defaultProfit: number;
  saleGst: number;
  deletionCode?: string;
}

export interface JointType {
  name: string;
  rate: number;
  multiplier: number; // For distance (e.g. 2 * width)
}

export interface TapeType {
  name: string;
  rate: number;
}

export interface FormationItem {
  name: string;
  rate: number;
  formula: string;
  unit: string;
}

export interface BOMItem {
  id: string;
  name: string;
  rate: number;
  unit: string;
  formula: string;
  isLocked?: boolean;
  options?: {
    name: string;
    rate: number;
    unit?: string;
    linkedStockId?: string;
    formula?: string;
    // Formation fields
    isFormation?: boolean;
    formationItems?: FormationItem[];
  }[];
  linkedStockId?: string;
}

export interface BeltStyle {
  id: string;
  name: string;
  bom: BOMItem[];
}

export interface BeltType {
  id: string;
  name: string;
  styles: BeltStyle[];
  fixCost?: number;
  gst?: number;
}

export interface Config {
  rates: Rates;
  constants: Constants;
  beltTypes: BeltType[];
  jointTypes: JointType[];
  tapeTypes: TapeType[];
  units: { id: string; label: string; value: string }[];
  awsServerUrl?: string;
  beltCutProUrl?: string;
}


export interface ProfitRange {
  minLength: number;
  maxLength: number | null;
  margin: number;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  city: string;
  profitMargins: Record<string, ProfitRange[]>; // beltType -> ranges
  mobile?: string;
}

export interface QuotationItem {
  id: string;
  beltType: string;
  beltStyle: string;
  dimensions: {
    length: number;
    width: number;
    unit?: 'mm' | 'ft' | 'mtr' | 'in';
    lengthUnit?: string;
    widthUnit?: string;
    hasHoles?: boolean;
    holeSize?: number;
    holeDistHorizontal?: number;
    holeDistVertical?: number;
    pricePerHole?: number;
    totalHoles?: number;
  };
  jointType?: string;
  tapeType?: string;
  totalCost: number;
  selectedBOMOptions?: Record<string, any>;
  calculated?: any; // Contains the full costing calculation breakdown/summary
}

export interface Quotation {
  id: string;
  clientId: string;
  clientName: string;
  beltType: string;
  dimensions: {
    length: number;
    width: number;
    unit?: 'mm' | 'ft' | 'mtr' | 'in';
    lengthUnit?: string;
    widthUnit?: string;
    hasHoles?: boolean;
    holeSize?: number;
    holeDistHorizontal?: number;
    holeDistVertical?: number;
    pricePerHole?: number;
    totalHoles?: number;
  };
  jointType: string;
  tapeType: string;
  totalCost: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'order' | 'executed';
  discountRequested?: number;
  discountReason?: string;
  salesMarkup?: number;
  rejectionReason?: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  auditLogs: AuditLog[];
  company?: string;
  beltStyle?: string;
  selectedBOMOptions?: Record<string, number>;
  items?: QuotationItem[];
}

export interface AuditLog {
  timestamp: any;
  userId: string;
  userName: string;
  action: string;
  details: string;
}

export interface Company {
  id: string;
  name: string;
}

export interface MaterialPiece {
  pieceNo: number;
  weight: number;
}

export interface MaterialLot {
  lotNumber: string;
  pieces: MaterialPiece[];
}

export interface MaterialStock {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  reorderLevel?: number;
  lots?: MaterialLot[];
}
