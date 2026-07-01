export type Unit = 'm' | 'cm' | 'mm' | 'ft' | 'in';

export interface Cut {
  id: string;
  orderId: string;
  customerName: string;
  width: number; // in meters (internal base)
  length: number; // in meters (internal base)
  x: number; // position on roll
  y: number; // position on roll
  status: 'planned' | 'completed' | 'scrap';
  color?: string;
  isInventoryCut?: boolean;
  soNumber?: string;
}

export interface Roll {
  id: string;
  materialType: string;
  fullWidth: number; // in meters
  fullLength: number; // in meters
  cuts: Cut[];
  totalSqm: number;
  remainingSqm: number;
  isArchived: boolean;
  isReuse?: boolean;
  parentRollId?: string | null;
  status?: 'active' | 'refused';
  reorderLevel?: number;
}

export interface Order {
  id: string;
  customerName: string;
  requiredWidth: number;
  requiredLength: number;
  quantity: number;
  materialType: string;
  date: string;
  isInventoryCut?: boolean;
  soNumber?: string;
}

export interface OptimizationCandidate {
  rollId: string;
  placement: { x: number; y: number };
  score: number;
  reason: string;
  wastageImpact: number;
}

export interface StockStats {
  totalAvailableSqm: number;
  totalWastageSqm: number;
  efficiency: number;
  activeRolls: number;
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
  reorderLevel: number;
  lots?: MaterialLot[];
}

export interface MaterialIssue {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  issuedTo: string;
  notes: string;
  lotNumber?: string;
  issuedAt: string;
}

export interface MaterialRequest {
  id: string;
  materialId?: string;
  materialName: string;
  requestedQuantity: number;
  unit: string;
  requestedBy: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedQuantity?: number | null;
  approvedBy?: string;
  approvalNotes?: string;
  lotNumber?: string;
  requestedAt: string;
  approvedAt?: string | null;
}

export interface ReadyBeltStock {
  id: string;
  category: string;
  beltStock: string;
  size: string;
  openingPisc: number;
  recvPisc: number;
  issuesPisc: number;
  closingPisc: number;
  soNo: string;
  receiverName: string;
  detailsLog?: any[];
}
