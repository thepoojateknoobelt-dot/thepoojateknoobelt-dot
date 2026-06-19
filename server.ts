import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL connection pool optimized with dynamic pooling and retry settings
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:asif%40keshwani1234@35.154.73.173:5432/postgres?connect_timeout=10&sslmode=disable';
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10, // Ek sath 10 active connections khule rahenge
  idleTimeoutMillis: 30000, // 30 seconds tak idle rha toh hi band hoga
  connectionTimeoutMillis: 15000, // 15 seconds tak wait karega connect hone ke liye
});

// Handle pool errors to prevent application crash
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Database schema auto-creation migration script
async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');
    
    // Create Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) DEFAULT MD5(random()::text) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) DEFAULT 'User' NOT NULL,
        role VARCHAR(50) DEFAULT 'admin' NOT NULL,
        password VARCHAR(255) NOT NULL,
        username_lower VARCHAR(255) DEFAULT '' NOT NULL
      )
    `);

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permission VARCHAR(50) DEFAULT 'write' NOT NULL`);
    } catch (alterErr) {
      console.warn('Failed to add permission column to users table:', alterErr);
    }

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_pages TEXT DEFAULT 'dashboard,calculator,quotations,clients' NOT NULL`);
    } catch (alterErr) {
      console.warn('Failed to add allowed_pages column to users table:', alterErr);
    }

    // Create Clients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        profit_margins JSONB NOT NULL
      )
    `);

    // Ensure mobile, address, and gstin columns exist on clients table
    try {
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS mobile VARCHAR(50)`);
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT`);
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS gstin VARCHAR(50)`);
    } catch (alterErr) {
      console.warn('Failed to add columns to clients table:', alterErr);
    }

    // Create System Config table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        id VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL
      )
    `);

    // Create Quotations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id VARCHAR(255) PRIMARY KEY,
        client_id VARCHAR(255) NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        belt_type VARCHAR(255) NOT NULL,
        dimensions JSONB NOT NULL,
        joint_type VARCHAR(255),
        tape_type VARCHAR(255),
        total_cost NUMERIC NOT NULL,
        status VARCHAR(50) NOT NULL,
        discount_requested NUMERIC,
        discount_reason TEXT,
        rejection_reason TEXT,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        audit_logs JSONB DEFAULT '[]'::jsonb
      )
    `);

    // Ensure joint_type and tape_type are nullable for legacy/custom calculations
    try {
      await pool.query(`ALTER TABLE quotations ALTER COLUMN joint_type DROP NOT NULL`);
      await pool.query(`ALTER TABLE quotations ALTER COLUMN tape_type DROP NOT NULL`);
    } catch (alterErr) {
      console.warn('Failed to alter quotations columns to drop NOT NULL constraint:', alterErr);
    }

    // Ensure company column exists on quotations table
    try {
      await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS company VARCHAR(255)`);
    } catch (alterErr) {
      console.warn('Failed to add company column to quotations table:', alterErr);
    }

    // Ensure belt_style, selected_bom_options and items columns exist on quotations table
    try {
      await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS belt_style VARCHAR(255)`);
      await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS selected_bom_options JSONB DEFAULT '{}'::jsonb`);
      await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb`);
    } catch (alterErr) {
      console.warn('Failed to add columns to quotations table:', alterErr);
    }

    // Create Companies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      )
    `);

    // Prepopulate default company if table is empty
    try {
      const compCheck = await pool.query('SELECT COUNT(*) FROM companies');
      if (parseInt(compCheck.rows[0].count, 10) === 0) {
        await pool.query("INSERT INTO companies (id, name) VALUES ($1, $2)", ['comp-1', 'Pooja Tekno Belt']);
      }
    } catch (compErr) {
      console.warn('Failed to pre-populate default company:', compErr);
    }

    // Create Material Stocks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS material_stocks (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        quantity NUMERIC NOT NULL DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'pcs' NOT NULL
      )
    `);

    // Add reorder_level column if it doesn't exist yet
    try {
      await pool.query(`ALTER TABLE material_stocks ADD COLUMN IF NOT EXISTS reorder_level NUMERIC NOT NULL DEFAULT 0`);
    } catch (alterErr) {
      console.warn('Failed to add reorder_level column:', alterErr);
    }

    // Seed default material stocks if empty
    try {
      const stockCheck = await pool.query('SELECT COUNT(*) FROM material_stocks');
      if (parseInt(stockCheck.rows[0].count, 10) === 0) {
        await pool.query("INSERT INTO material_stocks (id, name, quantity, unit, reorder_level) VALUES ($1, $2, $3, $4, $5)", ['stock-1', 'Screws', 250, 'pcs', 50]);
        await pool.query("INSERT INTO material_stocks (id, name, quantity, unit, reorder_level) VALUES ($1, $2, $3, $4, $5)", ['stock-2', 'Clips', 120, 'pcs', 30]);
        await pool.query("INSERT INTO material_stocks (id, name, quantity, unit, reorder_level) VALUES ($1, $2, $3, $4, $5)", ['stock-3', 'Glue', 15, 'bottles', 5]);
      }
    } catch (stockErr) {
      console.warn('Failed to pre-populate default material stocks:', stockErr);
    }

    // Create Material Issues (Production Log) table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS material_issues (
        id VARCHAR(255) PRIMARY KEY,
        material_id VARCHAR(255) NOT NULL,
        material_name VARCHAR(255) NOT NULL,
        quantity NUMERIC NOT NULL,
        unit VARCHAR(50) NOT NULL,
        issued_to VARCHAR(255) NOT NULL,
        notes TEXT DEFAULT '',
        issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

     // Create Material Requests table
     await pool.query(`
       CREATE TABLE IF NOT EXISTS material_requests (
         id VARCHAR(255) PRIMARY KEY,
         material_id VARCHAR(255),
         material_name VARCHAR(255) NOT NULL,
         requested_quantity NUMERIC NOT NULL,
         unit VARCHAR(50),
         requested_by VARCHAR(255) NOT NULL,
         notes TEXT,
         status VARCHAR(50) DEFAULT 'pending' NOT NULL,
         approved_quantity NUMERIC,
         approved_by VARCHAR(255),
         approval_notes TEXT,
         requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
         approved_at TIMESTAMP WITH TIME ZONE
       )
     `);

    // Create Audit Logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(255) PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        user_id VARCHAR(255) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT NOT NULL
      )
    `);

    // Create Rolls table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rolls (
        id VARCHAR(255) PRIMARY KEY,
        material_type VARCHAR(255) NOT NULL,
        full_width NUMERIC NOT NULL,
        full_length NUMERIC NOT NULL,
        total_sqm NUMERIC NOT NULL,
        remaining_sqm NUMERIC NOT NULL,
        is_archived BOOLEAN DEFAULT FALSE NOT NULL
      )
    `);

    // Create Cuts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cuts (
        id VARCHAR(255) PRIMARY KEY,
        roll_id VARCHAR(255) REFERENCES rolls(id) ON DELETE CASCADE,
        order_id VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        width NUMERIC NOT NULL,
        length NUMERIC NOT NULL,
        x NUMERIC NOT NULL,
        y NUMERIC NOT NULL,
        status VARCHAR(50) NOT NULL,
        color VARCHAR(50),
        is_inventory_cut BOOLEAN DEFAULT FALSE,
        so_number VARCHAR(255)
      )
    `);

    // Schema alterations for reuse roll tracking
    try {
      await pool.query(`ALTER TABLE rolls ADD COLUMN IF NOT EXISTS is_reuse BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE rolls ADD COLUMN IF NOT EXISTS parent_roll_id VARCHAR(255)`);
      await pool.query(`ALTER TABLE rolls ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`);
      await pool.query(`ALTER TABLE rolls ADD COLUMN IF NOT EXISTS reorder_level NUMERIC DEFAULT 0 NOT NULL`);
      await pool.query(`UPDATE rolls SET is_reuse = TRUE WHERE id LIKE 'REUSE-%' AND is_reuse = FALSE`);
    } catch (alterErr) {
      console.warn('Failed to add columns to rolls table:', alterErr);
    }

    // Schema alterations for cuts table
    try {
      await pool.query(`ALTER TABLE cuts ADD COLUMN IF NOT EXISTS so_number VARCHAR(255)`);
    } catch (alterErr) {
      console.warn('Failed to add so_number column to cuts table:', alterErr);
    }

    // Schema alterations for material type reorder levels
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS material_type_reorders (
          material_type VARCHAR(255) PRIMARY KEY,
          reorder_level NUMERIC DEFAULT 0 NOT NULL
        )
      `);
    } catch (alterErr) {
      console.warn('Failed to create material_type_reorders table:', alterErr);
    }

    // Create Custom Material Types table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS custom_material_types (
          name VARCHAR(255) PRIMARY KEY
        )
      `);

      // Prepopulate default material types if table is empty
      const typeCheck = await pool.query('SELECT COUNT(*) FROM custom_material_types');
      if (parseInt(typeCheck.rows[0].count, 10) === 0) {
        const defaultTypes = [
          'PVC - Green Rough Top',
          'PVC - White Food Grade',
          'Rubber - Heavy Duty Black',
          'PU - Blue Heat Resistant',
          'Fabric Reinforcement Grade'
        ];
        for (const t of defaultTypes) {
          await pool.query('INSERT INTO custom_material_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [t]);
        }
        console.log('Seeded default material types into custom_material_types.');
      }
    } catch (typeErr) {
      console.warn('Failed to initialize custom_material_types table:', typeErr);
    }

    // Create HRMS Departments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        ot_buffer_enabled BOOLEAN DEFAULT FALSE NOT NULL
      )
    `);

    // Create HRMS Shifts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        check_in VARCHAR(50) NOT NULL,
        check_out VARCHAR(50) NOT NULL,
        remark TEXT
      )
    `);

    // Create HRMS Employees table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        department VARCHAR(255) NOT NULL,
        shift VARCHAR(255) NOT NULL,
        monthly_salary NUMERIC NOT NULL DEFAULT 0,
        week_off VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'active' NOT NULL,
        image_url TEXT,
        embedding JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create HRMS Holidays table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        date VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        day_type VARCHAR(50) NOT NULL,
        applies_to VARCHAR(50) NOT NULL,
        departments JSONB NOT NULL,
        created_by VARCHAR(255) NOT NULL,
        PRIMARY KEY (date, name)
      )
    `);

    // Create HRMS Salary Advances table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS salary_advances (
        emp_id VARCHAR(255) NOT NULL,
        yymm VARCHAR(10) NOT NULL,
        total_advance NUMERIC DEFAULT 0,
        entries JSONB DEFAULT '{}'::jsonb,
        PRIMARY KEY (emp_id, yymm)
      )
    `);

    // Create HRMS Attendance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        emp_id VARCHAR(255) NOT NULL,
        date VARCHAR(50) NOT NULL,
        check_in_local VARCHAR(100),
        check_out_local VARCHAR(100),
        check_in_server VARCHAR(100),
        check_out_server VARCHAR(100),
        status VARCHAR(50),
        metrics JSONB,
        PRIMARY KEY (emp_id, date)
      )
    `);

    // Create HRMS Payroll Bulk table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_bulk (
        yymm VARCHAR(10) PRIMARY KEY,
        report_data JSONB
      )
    `);

    // Create HRMS Payroll Individual table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_individual (
        yymm VARCHAR(10) NOT NULL,
        emp_id VARCHAR(255) NOT NULL,
        calc_data JSONB,
        PRIMARY KEY (yymm, emp_id)
      )
    `);

    // Prepopulate departments if empty
    try {
      const deptCheck = await pool.query('SELECT COUNT(*) FROM departments');
      if (parseInt(deptCheck.rows[0].count, 10) === 0) {
        await pool.query("INSERT INTO departments (id, name, ot_buffer_enabled) VALUES ($1, $2, $3)", ['Admin', 'Admin', false]);
        await pool.query("INSERT INTO departments (id, name, ot_buffer_enabled) VALUES ($1, $2, $3)", ['Production', 'Production', true]);
        await pool.query("INSERT INTO departments (id, name, ot_buffer_enabled) VALUES ($1, $2, $3)", ['Sales', 'Sales', false]);
        console.log('Seeded default departments.');
      }
    } catch (deptErr) {
      console.warn('Failed to pre-populate default departments:', deptErr);
    }

    // Prepopulate shifts if empty
    try {
      const shiftCheck = await pool.query('SELECT COUNT(*) FROM shifts');
      if (parseInt(shiftCheck.rows[0].count, 10) === 0) {
        await pool.query("INSERT INTO shifts (id, name, check_in, check_out, remark) VALUES ($1, $2, $3, $4, $5)", ['Day Shift', 'Day Shift', '09:30', '18:30', 'Standard Day Shift']);
        console.log('Seeded default shifts.');
      }
    } catch (shiftErr) {
      console.warn('Failed to pre-populate default shifts:', shiftErr);
    }

    console.log('Database schema checked/created successfully.');

    // Cleanup any auto-logged refused/waste/reuse stock issues from material_issues table
    try {
      await pool.query(
        "DELETE FROM material_issues WHERE issued_to = $1 OR id LIKE $2 OR id LIKE $3",
        ['REJECTED / WASTE', 'issue-refused-sync-%', 'issue-refused-%']
      );
      console.log('Cleaned up refused/waste logs from material_issues.');
    } catch (cleanErr) {
      console.warn('Failed to clean up refused issues:', cleanErr);
    }

    // Seed default admin user if none exists
    const adminCheck = await pool.query("SELECT * FROM users WHERE username = 'admin'");
    if (adminCheck.rowCount === 0) {
      console.log('No admin user found. Seeding default admin...');
      const adminPasswordHash = bcrypt.hashSync('admin', 10);
      await pool.query(`
        INSERT INTO users (id, username, name, role, password, username_lower)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['admin_user', 'admin', 'System Admin', 'admin', adminPasswordHash, 'admin']);
      console.log('Default admin seeded with password "admin".');
    }

    // Seed default config if none exists
    const configCountResult = await pool.query('SELECT COUNT(*) FROM system_config');
    if (parseInt(configCountResult.rows[0].count) === 0) {
      console.log('No system config found. Seeding defaults...');
      let defaultData = {};
      try {
        const localPath = path.join(process.cwd(), 'data', 'config.json');
        if (fs.existsSync(localPath)) {
          defaultData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
        }
      } catch (err) {
        console.error('Failed to read local config.json, using minimal defaults', err);
      }
      
      if (Object.keys(defaultData).length === 0) {
        defaultData = {
          rates: { mesh: 10, fep: 20, thread: 5, pin: 15, packing: 50 },
          constants: { purchaseGst: 18, fixCost: 10, defaultProfit: 20, saleGst: 18 },
          beltTypes: [],
          jointTypes: [],
          tapeTypes: [],
          units: [{ id: 'mm', label: 'Millimeters', value: 'mm' }]
        };
      }

      await pool.query(`
        INSERT INTO system_config (id, data)
        VALUES ($1, $2)
      `, ['default', JSON.stringify(defaultData)]);
      console.log('Default system config seeded.');
    }
  } catch (err: any) {
    const offlineCodes = ['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT'];
    const isOffline = offlineCodes.includes(err.code) || offlineCodes.some(code => err.message?.includes(code));
    if (isOffline) {
      console.warn(`⚠️ PostgreSQL database offline or unreachable (${err.code || 'Unreachable'}). Local API endpoints will run, but database features require an active connection.`);
    } else {
      console.error('Error during database initialization:', err);
    }
  }
}

// Trigger asynchronous database check on module load
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

app.use(express.json());
app.use(cookieParser());

// Dynamic CORS middleware to support S3 Static Website and Local Dev cross-origin requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const toMetersBackend = (val: number, u: string) => {
  if (!u) return val;
  const unit = u.toLowerCase();
  if (unit === 'mm' || unit === 'millimeters') return val / 1000;
  if (unit === 'ft' || unit === 'feet') return val * 0.3048;
  if (unit === 'in' || unit === 'inch' || unit === 'inches') return val * 0.0254;
  if (unit === 'mtr' || unit === 'm' || unit === 'meter' || unit === 'meters') return val;
  return val;
};

const evaluateFormulaBackend = (formula: string, L: number, W: number) => {
  try {
    if (!formula) return 0;
    const sanitized = formula.toUpperCase().replace(/\s/g, '');
    if (!/^[0-9LWP\.\+\-\*\/\(\)]+$/.test(sanitized)) return 0;
    
    const P = 2 * ((L || 0) + (W || 0));
    
    const expr = sanitized
      .replace(/L/g, `(${L || 0})`)
      .replace(/W/g, `(${W || 0})`)
      .replace(/P/g, `(${P})`);
    
    const result = Function(`"use strict"; return (${expr})`)();
    return isNaN(result) ? 0 : result;
  } catch (e) {
    console.error('Formula Error:', formula, e);
    return 0;
  }
};

async function deductStockForSingleItem(
  quote: any,
  itemData: {
    beltType: string;
    beltStyle: string;
    dimensions: any;
    selectedBOMOptions: any;
  },
  config: any
) {
  const { beltType, beltStyle, dimensions, selectedBOMOptions } = itemData;
  if (!dimensions || !beltType || !beltStyle) {
    return;
  }

  const length = parseFloat(dimensions.length);
  const width = parseFloat(dimensions.width);
  const lengthUnit = dimensions.lengthUnit || dimensions.unit || 'mm';
  const widthUnit = dimensions.widthUnit || dimensions.unit || 'mm';

  const lMtr = toMetersBackend(length, lengthUnit);
  const wMtr = toMetersBackend(width, widthUnit);

  if (!config || !Array.isArray(config.beltTypes)) return;

  const category = config.beltTypes.find((t: any) => t.name === beltType);
  if (!category || !Array.isArray(category.styles)) return;
  const style = category.styles.find((s: any) => s.name === beltStyle);
  if (!style || !Array.isArray(style.bom)) return;

  const included = selectedBOMOptions?._included;

  for (const item of style.bom) {
    if (included && included[item.id] === false) {
      continue;
    }
    let linkedStockId = item.linkedStockId;
    let selectedOptionName = '';
    let activeFormula = item.formula;
    
    const optIdx = selectedBOMOptions[item.id];
    if (optIdx !== undefined && Array.isArray(item.options) && item.options[optIdx]) {
      const opt = item.options[optIdx];
      if (opt.linkedStockId) {
        linkedStockId = opt.linkedStockId;
      }
      selectedOptionName = opt.name || '';
      if (opt.formula) {
        activeFormula = opt.formula;
      }
    }

    if (!linkedStockId) continue;

    let consumption = evaluateFormulaBackend(activeFormula || '', lMtr, wMtr);
    const u = (item.unit || '').toLowerCase();
    if (u === 'ft' || u === 'feet') consumption = consumption / 0.3048;
    else if (u === 'in' || u === 'inch' || u === 'inches') consumption = consumption / 0.0254;
    else if (u === 'mm' || u === 'millimeters') consumption = consumption * 1000;
    else if (u.includes('sq')) {
      if (u.includes('ft') || u.includes('feet')) consumption = consumption / (0.3048 * 0.3048);
      else if (u.includes('in') || u.includes('inch') || u.includes('inches')) consumption = consumption / (0.0254 * 0.0254);
      else if (u.includes('mm') || u.includes('millimeters')) consumption = consumption * (1000 * 1000);
    }

    const stockRes = await pool.query('SELECT * FROM material_stocks WHERE id = $1', [linkedStockId]);
    if (stockRes.rowCount === 0) continue;
    const stock = stockRes.rows[0];

    const deductQty = parseFloat(consumption.toFixed(4));
    const newQty = Math.max(0, parseFloat(stock.quantity) - deductQty);
    await pool.query('UPDATE material_stocks SET quantity = $1 WHERE id = $2', [newQty, linkedStockId]);

    const issueId = 'issue-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const issuedTo = `Order #${quote.id} (${quote.client_name})`;
    const note = `Auto-deducted on execution. Style: ${beltStyle}, BOM Component: ${item.name}${selectedOptionName ? ` (${selectedOptionName})` : ''}`;
    
    await pool.query(
      `INSERT INTO material_issues (id, material_id, material_name, quantity, unit, issued_to, notes, issued_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [issueId, linkedStockId, stock.name, deductQty, stock.unit, issuedTo, note]
    );
  }
}

// ─── Smart Multi-Item Cutting Optimizer ────────────────────────────────────
// Greedy Best-Fit-Decreasing bin packing across belt rolls.
// Priority: use existing inventory rolls first, then fresh rolls.
// Goal: minimise total scrap (remaining_sqm loss).

interface CutAllocation {
  itemIndex: number;
  itemLabel: string;
  beltType: string;
  widthM: number;  // meters
  lengthM: number; // meters
  areaSqm: number;
  rollId: string;
  x: number;
  y: number;
  source: 'inventory' | 'fresh_roll';
  scrapAfter: number; // remaining_sqm on the roll after this cut
}

interface SmartCutPlan {
  allocations: CutAllocation[];
  rollsUsed: string[];
  totalScrapSqm: number;
  warnings: string[];
}

async function smartCutForQuotation(quotationId: string, clientName: string): Promise<SmartCutPlan> {
  // 1. Load quotation items
  const quoteRes = await pool.query('SELECT * FROM quotations WHERE id = $1', [quotationId]);
  if (quoteRes.rowCount === 0) throw new Error('Quotation not found');
  const quote = quoteRes.rows[0];

  const rawItems: any[] = quote.items
    ? (typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items)
    : [];

  const warnings: string[] = [];
  const allocations: CutAllocation[] = [];

  if (rawItems.length === 0) {
    // Single-item fallback — read top-level columns
    const dims = typeof quote.dimensions === 'string' ? JSON.parse(quote.dimensions) : (quote.dimensions || {});
    rawItems.push({
      beltType: quote.belt_type,
      beltStyle: quote.belt_style,
      dimensions: dims
    });
  }

  // 2. Convert all items to metres and compute area
  const items = rawItems.map((item: any, idx: number) => {
    const dims = item.dimensions || {};
    const lM = toMetersBackend(parseFloat(dims.length) || 0, dims.lengthUnit || dims.unit || 'mm');
    const wM = toMetersBackend(parseFloat(dims.width)  || 0, dims.widthUnit  || dims.unit || 'mm');
    return {
      index: idx,
      label: `Item ${idx + 1} (${item.beltType || 'Unknown'} / ${item.beltStyle || ''})`,
      beltType: (item.beltType || '').trim(),
      lengthM: lM,
      widthM: wM,
      areaSqm: lM * wM
    };
  });

  // 3. Sort largest area first (Best-Fit Decreasing)
  items.sort((a, b) => b.areaSqm - a.areaSqm);

  // 4. Load all active rolls from DB
  const rollsRes = await pool.query(
    `SELECT * FROM rolls WHERE is_archived = false AND status != 'archived' ORDER BY remaining_sqm ASC`
  );
  // Working copy of roll state (so we can simulate without committing yet)
  const rollState: Map<string, { 
    remainingSqm: number; 
    fullWidth: number; 
    fullLength: number; 
    materialType: string;
    currentY: number; // next available Y position within the roll (metres)
  }> = new Map();

  for (const r of rollsRes.rows) {
    rollState.set(r.id, {
      remainingSqm: parseFloat(r.remaining_sqm),
      fullWidth: parseFloat(r.full_width),
      fullLength: parseFloat(r.full_length),
      materialType: r.material_type,
      currentY: 0
    });
  }

  // Helper — does a roll's materialType match the item's beltType?
  // We do a case-insensitive substring match to handle slight naming differences.
  const rollMatchesItem = (materialType: string, beltType: string): boolean => {
    if (!beltType) return true; // no filter
    const mt = materialType.toLowerCase();
    const bt = beltType.toLowerCase();
    return mt.includes(bt) || bt.includes(mt);
  };

  // 5. Best-Fit heuristic: for each item find the roll where it fits and leaves least remaining space
  for (const item of items) {
    let bestRollId: string | null = null;
    let bestRemaining = Infinity;

    for (const [rid, rState] of rollState) {
      if (!rollMatchesItem(rState.materialType, item.beltType)) continue;
      // Check if item physically fits in roll dimensions
      if (item.widthM > rState.fullWidth) continue;
      const remainingAfter = rState.remainingSqm - item.areaSqm;
      if (remainingAfter < 0) continue; // not enough area
      // Prefer the roll that leaves the LEAST remaining (Best Fit)
      if (remainingAfter < bestRemaining) {
        bestRemaining = remainingAfter;
        bestRollId = rid;
      }
    }

    if (bestRollId) {
      // Use existing roll
      const rState = rollState.get(bestRollId)!;
      const x = 0;
      const y = rState.currentY;
      const newCurrentY = y + item.lengthM;
      const newRemaining = rState.remainingSqm - item.areaSqm;

      rollState.set(bestRollId, {
        ...rState,
        remainingSqm: newRemaining,
        currentY: newCurrentY
      });

      allocations.push({
        itemIndex: item.index,
        itemLabel: item.label,
        beltType: item.beltType,
        widthM: item.widthM,
        lengthM: item.lengthM,
        areaSqm: item.areaSqm,
        rollId: bestRollId,
        x,
        y,
        source: 'inventory',
        scrapAfter: Math.max(0, newRemaining)
      });
    } else {
      // No matching roll had enough space — mark as needing fresh roll
      warnings.push(`⚠️ ${item.label}: No existing roll found. Will cut from a fresh roll (add one manually in Nesting Portal).`);
      allocations.push({
        itemIndex: item.index,
        itemLabel: item.label,
        beltType: item.beltType,
        widthM: item.widthM,
        lengthM: item.lengthM,
        areaSqm: item.areaSqm,
        rollId: 'FRESH_ROLL_NEEDED',
        x: 0,
        y: 0,
        source: 'fresh_roll',
        scrapAfter: 0
      });
    }
  }

  // 6. Persist cuts in DB for rolls that were matched (non-fresh)
  const rollsUsed: Set<string> = new Set();
  const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6'];

  for (const alloc of allocations) {
    if (alloc.rollId === 'FRESH_ROLL_NEEDED') continue;

    const cutId = `cut-smartq-${quotationId}-${alloc.itemIndex}-${Date.now()}`;
    const color = COLORS[alloc.itemIndex % COLORS.length];

    await pool.query(
      `INSERT INTO cuts (id, roll_id, order_id, customer_name, width, length, x, y, status, color, is_inventory_cut, so_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        cutId, alloc.rollId, quotationId, clientName,
        alloc.widthM, alloc.lengthM,
        alloc.x, alloc.y,
        'planned', color, false, null
      ]
    );

    // Update roll remaining_sqm
    await pool.query(
      'UPDATE rolls SET remaining_sqm = $1 WHERE id = $2',
      [alloc.scrapAfter, alloc.rollId]
    );

    rollsUsed.add(alloc.rollId);
  }

  const totalScrapSqm = Array.from(rollState.values())
    .filter(r => rollsUsed.has([...rollState.entries()].find(([,v]) => v === r)?.[0] ?? ''))
    .reduce((sum, r) => sum + r.remainingSqm, 0);

  return {
    allocations,
    rollsUsed: Array.from(rollsUsed),
    totalScrapSqm: Math.max(0, parseFloat(totalScrapSqm.toFixed(4))),
    warnings
  };
}

async function deductStockForQuotation(quotationId: string, updateData: any) {
  try {
    const quoteRes = await pool.query('SELECT * FROM quotations WHERE id = $1', [quotationId]);
    if (quoteRes.rowCount === 0) return;
    const quote = quoteRes.rows[0];

    const configRes = await pool.query('SELECT data FROM system_config WHERE id = $1', ['default']);
    if (configRes.rowCount === 0) return;
    const config = configRes.rows[0].data;

    const items = updateData.items || (typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items) || [];
    
    if (items.length > 0) {
      for (const item of items) {
        await deductStockForSingleItem(quote, {
          beltType: item.beltType,
          beltStyle: item.beltStyle,
          dimensions: item.dimensions,
          selectedBOMOptions: item.selectedBOMOptions
        }, config);
      }
    } else {
      const beltType = updateData.beltType || quote.belt_type;
      const beltStyle = updateData.beltStyle || quote.belt_style;
      const dimensions = typeof quote.dimensions === 'string' ? JSON.parse(quote.dimensions) : quote.dimensions;
      const selectedBOMOptions = updateData.selectedBOMOptions || quote.selected_bom_options || {};
      
      await deductStockForSingleItem(quote, {
        beltType,
        beltStyle,
        dimensions,
        selectedBOMOptions
      }, config);
    }
  } catch (err) {
    console.error('Error in deductStockForQuotation:', err);
  }
}

// Calculation Logic
const calculateCosting = (data: any, config: any, clientProfitRanges: any[] = [], customBOM: any[] = []) => {
  const { length, width, jointType, lengthUnit, widthUnit, manualPackingCost, manualProfitMargin } = data;
  const { rates, constants, jointTypes } = config;

  const toMeters = (val: number, u: string) => {
    if (u === 'mm') return val / 1000;
    if (u === 'ft') return val * 0.3048;
    if (u === 'in') return val * 0.0254;
    return val;
  };

  const lMtr = toMeters(parseFloat(length), lengthUnit);
  const wMtr = toMeters(parseFloat(width), widthUnit);

  const breakdown: any = {};
  let subtotal = 0;

  customBOM.forEach(item => {
    let consumption = 0;
    switch (item.formulaType) {
      case 'sqm': consumption = lMtr * wMtr; break;
      case 'running_l': consumption = 2 * lMtr; break;
      case 'running_w': consumption = 2 * wMtr; break;
      case 'thread': consumption = wMtr * 10 * 4 * 2; break;
      case 'pin': consumption = 2 * wMtr * 1.05; break;
      case 'joint': 
        const sj = jointTypes?.find((j: any) => j.name === jointType);
        consumption = (sj?.multiplier || 2) * wMtr; 
        break;
      case 'fixed': consumption = 1; break;
    }
    
    const cost = Math.round(consumption * item.rate);
    subtotal += cost;
    breakdown[item.name.toLowerCase().replace(/\s+/g, '_')] = {
      consumption,
      rate: item.rate,
      cost
    };
  });

  const packingCost = Math.round(manualPackingCost !== undefined ? parseFloat(manualPackingCost) : rates.packing);
  subtotal += packingCost;
  breakdown['packing'] = { consumption: 1, rate: manualPackingCost || rates.packing, cost: packingCost };

  const purchaseGstAmount = Math.round(subtotal * (constants.purchaseGst / 100));
  const totalWithPurchaseGst = Math.round(subtotal + purchaseGstAmount);
  
  const fixCostAmount = Math.round(totalWithPurchaseGst * (constants.fixCost / 100));
  const totalWithFixCost = Math.round(totalWithPurchaseGst + fixCostAmount);
  
  // Resolve profit margin based on length ranges
  let resolvedClientMargin = constants.defaultProfit;
  if (Array.isArray(clientProfitRanges) && clientProfitRanges.length > 0) {
    const applicableRange = clientProfitRanges.find(r => 
      lMtr >= r.minLength && (r.maxLength === null || lMtr < r.maxLength)
    );
    if (applicableRange) {
      resolvedClientMargin = applicableRange.margin;
    }
  }

  const profitMargin = manualProfitMargin || resolvedClientMargin;
  const profitAmount = Math.round(totalWithFixCost * (profitMargin / 100));
  const totalWithProfit = Math.round(totalWithFixCost + profitAmount);

  const saleGstAmount = Math.round(totalWithProfit * (constants.saleGst / 100));
  const finalTotal = Math.round(totalWithProfit + saleGstAmount);

  return {
    breakdown,
    summary: {
      subtotal,
      purchaseGst: purchaseGstAmount,
      totalWithPurchaseGst,
      fixCost: fixCostAmount,
      totalWithFixCost,
      profit: profitAmount,
      profitMarginUsed: profitMargin,
      totalWithProfit,
      saleGst: saleGstAmount,
      finalTotal
    }
  };
};

// API Routes
app.post('/api/calculate', (req, res) => {
  const { data, config, clientProfitRanges, bom, isAdmin } = req.body;
  const result = calculateCosting(data, config, clientProfitRanges, bom);
  
  if (!isAdmin) {
    // Hide breakdown for sales people
    return res.json({
      summary: {
        finalTotal: result.summary.finalTotal
      }
    });
  }
  
  res.json(result);
});

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  const { username, email, password } = req.body;
  const loginIdentifier = username || (email ? email.split('@')[0] : '');
  console.log('Login request received for:', loginIdentifier);

  const isSecure = !!(req.secure || req.headers['x-forwarded-proto'] === 'https');
  const cookieOptions: any = {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure
  };

  // Direct bypass check for admin/admin
  if ((loginIdentifier === 'admin' || loginIdentifier === 'admin_user') && (password === 'admin' || password === '123456')) {
    console.log('Login bypassed for admin/admin');
    const token = jwt.sign({ 
      id: 'admin_user', 
      username: 'admin', 
      role: 'admin', 
      name: 'System Admin', 
      permission: 'write',
      allowedPages: ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production', 'nesting_dashboard', 'nesting_cutting', 'nesting_rolls_map', 'nesting_details', 'nesting_stock', 'nesting_production', 'nesting_scrub']
    }, JWT_SECRET);
    return res.cookie('token', token, cookieOptions).json({ 
      user: { 
        id: 'admin_user', 
        username: 'admin', 
        role: 'admin', 
        name: 'System Admin', 
        permission: 'write',
        allowedPages: ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production', 'nesting_dashboard', 'nesting_cutting', 'nesting_rolls_map', 'nesting_details', 'nesting_stock', 'nesting_production', 'nesting_scrub']
      } 
    });
  }

  try {
    const normalizedUsername = loginIdentifier.toLowerCase().trim().replace(/\s+/g, '_');
    
    // Select user from PG
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 OR username_lower = $2 OR username = $3',
      [normalizedUsername, normalizedUsername, loginIdentifier]
    );

    let user = result.rows[0];
    if (!user && normalizedUsername === 'admin') {
      const adminFallbackResult = await pool.query('SELECT * FROM users WHERE id = $1', ['admin_user']);
      user = adminFallbackResult.rows[0];
    }

    if (!user) {
      console.warn('User not found:', loginIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = user.password.startsWith('$2') 
      ? bcrypt.compareSync(password, user.password)
      : password === user.password;

    if (!isMatch) {
      console.warn('Invalid password for user:', loginIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Login successful for:', loginIdentifier);
    const userPages = user.role === 'admin'
      ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production', 'nesting_dashboard', 'nesting_cutting', 'nesting_rolls_map', 'nesting_details', 'nesting_stock', 'nesting_production', 'nesting_scrub']
      : (user.allowed_pages || 'dashboard,calculator,quotations,clients').split(',');
    
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      name: user.name, 
      permission: user.permission || 'write',
      allowedPages: userPages
    }, JWT_SECRET);
    res.cookie('token', token, cookieOptions).json({ 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        name: user.name, 
        permission: user.permission || 'write',
        allowedPages: userPages
      } 
    });
  } catch (error) {
    console.error('Login error on server:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token').json({ success: true });
});

app.get('/api/auth/me', authenticate, (req: any, res) => {
  const email = req.user.role === 'admin' ? 'admin@ptb.com' : 'account@ptb.com';
  res.json({ 
    user: req.user,
    email: email
  });
});

// Helper to get YYMM format
const getYYMM = (date: Date = new Date()) => {
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${yy}${mm}`;
};

// HRMS API: Departments
app.get('/api/departments', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM departments ORDER BY name ASC');
    res.json(result.rows.map(r => ({
      id: r.id,
      name: r.name,
      otBufferEnabled: r.ot_buffer_enabled
    })));
  } catch (err) {
    console.error('Failed to get departments', err);
    res.status(500).json({ error: 'Failed to retrieve departments' });
  }
});

app.post('/api/departments', authenticate, async (req, res) => {
  const { id, name, otBufferEnabled } = req.body;
  try {
    await pool.query(
      'INSERT INTO departments (id, name, ot_buffer_enabled) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, ot_buffer_enabled = EXCLUDED.ot_buffer_enabled',
      [id || name, name, otBufferEnabled || false]
    );
    res.json({ id: id || name, name, otBufferEnabled: otBufferEnabled || false });
  } catch (err) {
    console.error('Failed to add department', err);
    res.status(500).json({ error: 'Failed to add department' });
  }
});

app.put('/api/departments/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, otBufferEnabled } = req.body;
  try {
    await pool.query(
      'UPDATE departments SET name = $1, ot_buffer_enabled = $2 WHERE id = $3',
      [name, otBufferEnabled, id]
    );
    res.json({ id, name, otBufferEnabled });
  } catch (err) {
    console.error('Failed to update department', err);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

app.delete('/api/departments/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM departments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete department', err);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

// HRMS API: Shifts
app.get('/api/shifts', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shifts ORDER BY name ASC');
    res.json(result.rows.map(r => ({
      id: r.id,
      name: r.name,
      checkIn: r.check_in,
      checkOut: r.check_out,
      remark: r.remark
    })));
  } catch (err) {
    console.error('Failed to get shifts', err);
    res.status(500).json({ error: 'Failed to retrieve shifts' });
  }
});

app.post('/api/shifts', authenticate, async (req, res) => {
  const { id, name, checkIn, checkOut, remark } = req.body;
  try {
    await pool.query(
      'INSERT INTO shifts (id, name, check_in, check_out, remark) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, remark = EXCLUDED.remark',
      [id || name, name, checkIn, checkOut, remark || null]
    );
    res.json({ id: id || name, name, checkIn, checkOut, remark });
  } catch (err) {
    console.error('Failed to add shift', err);
    res.status(500).json({ error: 'Failed to add shift' });
  }
});

app.put('/api/shifts/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, checkIn, checkOut, remark } = req.body;
  try {
    await pool.query(
      'UPDATE shifts SET name = $1, check_in = $2, check_out = $3, remark = $4 WHERE id = $5',
      [name, checkIn, checkOut, remark || null, id]
    );
    res.json({ id, name, checkIn, checkOut, remark });
  } catch (err) {
    console.error('Failed to update shift', err);
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

app.delete('/api/shifts/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM shifts WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete shift', err);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

// HRMS API: Employees
app.get('/api/employees/next-id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM employees');
    let maxNum = 0;
    for (const r of result.rows) {
      const m = r.id.match(/^PTB(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const nextId = `PTB${(maxNum + 1).toString().padStart(3, '0')}`;
    res.json({ nextId });
  } catch (err) {
    console.error('Failed to calculate next employee id', err);
    res.status(500).json({ error: 'Failed to calculate next ID' });
  }
});

app.get('/api/employees', authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM employees WHERE status = 'active' ORDER BY id ASC");
    res.json(result.rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      department: r.department,
      shift: r.shift,
      monthlySalary: parseFloat(r.monthly_salary || 0),
      weekOff: r.week_off,
      status: r.status,
      imageUrl: r.image_url,
      embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding,
      createdAt: r.created_at
    })));
  } catch (err) {
    console.error('Failed to get employees', err);
    res.status(500).json({ error: 'Failed to retrieve employees' });
  }
});

app.post('/api/employees', authenticate, async (req, res) => {
  const { id, name, phone, department, shift, monthlySalary, weekOff, status, imageUrl, embedding } = req.body;
  try {
    await pool.query(
      `INSERT INTO employees (id, name, phone, department, shift, monthly_salary, week_off, status, image_url, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
      [id, name, phone, department, shift, monthlySalary || 0, weekOff, status || 'active', imageUrl || null, JSON.stringify(embedding || null)]
    );
    res.json({ id, name, phone, department, shift, monthlySalary, weekOff, status, imageUrl, embedding });
  } catch (err) {
    console.error('Failed to register employee', err);
    res.status(500).json({ error: 'Failed to register employee' });
  }
});

app.put('/api/employees/:id', authenticate, async (req, res) => {
  const { name, phone, department, shift, monthlySalary, weekOff, status, imageUrl, embedding } = req.body;
  try {
    await pool.query(
      `UPDATE employees SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         department = COALESCE($3, department),
         shift = COALESCE($4, shift),
         monthly_salary = COALESCE($5, monthly_salary),
         week_off = COALESCE($6, week_off),
         status = COALESCE($7, status),
         image_url = COALESCE($8, image_url),
         embedding = COALESCE($9, embedding)
       WHERE id = $10`,
      [name, phone, department, shift, monthlySalary !== undefined ? monthlySalary : null, weekOff, status, imageUrl, embedding ? JSON.stringify(embedding) : null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update employee', err);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

app.delete('/api/employees/:id', authenticate, async (req, res) => {
  try {
    await pool.query("UPDATE employees SET status = 'deleted' WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete employee', err);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// HRMS API: Holidays
app.get('/api/holidays', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM holidays ORDER BY date ASC');
    res.json(result.rows.map(r => ({
      date: r.date,
      name: r.name,
      dayType: r.day_type,
      appliesTo: r.applies_to,
      departments: typeof r.departments === 'string' ? JSON.parse(r.departments) : (r.departments || []),
      createdBy: r.created_by
    })));
  } catch (err) {
    console.error('Failed to get holidays', err);
    res.status(500).json({ error: 'Failed to retrieve holidays' });
  }
});

app.post('/api/holidays', authenticate, async (req, res) => {
  const { date, name, dayType, appliesTo, departments, createdBy } = req.body;
  try {
    await pool.query(
      `INSERT INTO holidays (date, name, day_type, applies_to, departments, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (date, name) DO UPDATE SET
         day_type = EXCLUDED.day_type,
         applies_to = EXCLUDED.applies_to,
         departments = EXCLUDED.departments`,
      [date, name, dayType, appliesTo, JSON.stringify(departments || []), createdBy || 'Admin']
    );
    res.json({ date, name, dayType, appliesTo, departments, createdBy });
  } catch (err) {
    console.error('Failed to add holiday', err);
    res.status(500).json({ error: 'Failed to add holiday' });
  }
});

app.put('/api/holidays/:date/:name', authenticate, async (req, res) => {
  const { date, name } = req.params;
  const { dayType, appliesTo, departments, newDate, newName } = req.body;
  try {
    const finalDate = newDate || date;
    const finalName = newName || name;
    await pool.query(
      `UPDATE holidays 
       SET date = $1, name = $2, day_type = $3, applies_to = $4, departments = $5 
       WHERE date = $6 AND name = $7`,
      [finalDate, finalName, dayType, appliesTo, JSON.stringify(departments || []), date, name]
    );
    res.json({ date: finalDate, name: finalName, dayType, appliesTo, departments });
  } catch (err) {
    console.error('Failed to update holiday', err);
    res.status(500).json({ error: 'Failed to update holiday' });
  }
});

app.delete('/api/holidays/:date/:name', authenticate, async (req, res) => {
  const { date, name } = req.params;
  try {
    await pool.query('DELETE FROM holidays WHERE date = $1 AND name = $2', [date, name]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete holiday', err);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

// HRMS API: Salary Advances
app.post('/api/salary-advances', authenticate, async (req, res) => {
  const { empId, amount, remark, adminEmail, yymm } = req.body;
  const targetYYMM = yymm || getYYMM();
  const entryId = 'adv-' + Date.now();
  const newEntry = {
    id: entryId,
    amount,
    remark,
    addedBy: adminEmail || 'Admin',
    createdAt: new Date().toISOString()
  };
  try {
    const existRes = await pool.query('SELECT * FROM salary_advances WHERE emp_id = $1 AND yymm = $2', [empId, targetYYMM]);
    if (existRes.rowCount === 0) {
      const entries = { [entryId]: newEntry };
      await pool.query(
        'INSERT INTO salary_advances (emp_id, yymm, total_advance, entries) VALUES ($1, $2, $3, $4)',
        [empId, targetYYMM, amount, JSON.stringify(entries)]
      );
    } else {
      const current = existRes.rows[0];
      const entries = typeof current.entries === 'string' ? JSON.parse(current.entries) : (current.entries || {});
      entries[entryId] = newEntry;
      const newTotal = parseFloat(current.total_advance || 0) + amount;
      await pool.query(
        'UPDATE salary_advances SET total_advance = $1, entries = $2 WHERE emp_id = $3 AND yymm = $4',
        [newTotal, JSON.stringify(entries), empId, targetYYMM]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save salary advance' });
  }
});

app.get('/api/salary-advances/:empId', authenticate, async (req, res) => {
  const empId = req.params.empId;
  const yymm = req.query.yymm as string;
  try {
    if (yymm === 'ALL') {
      const result = await pool.query('SELECT * FROM salary_advances WHERE emp_id = $1', [empId]);
      let grandTotal = 0;
      const allEntries: Record<string, any> = {};
      for (const row of result.rows) {
        const entries = typeof row.entries === 'string' ? JSON.parse(row.entries) : (row.entries || {});
        Object.entries(entries).forEach(([key, entry]: [string, any]) => {
          allEntries[key] = {
            ...entry,
            yymm: row.yymm
          };
        });
        grandTotal += parseFloat(row.total_advance || 0);
      }
      return res.json({ totalAdvance: grandTotal, entries: allEntries });
    } else {
      const targetYYMM = yymm || getYYMM();
      const result = await pool.query('SELECT * FROM salary_advances WHERE emp_id = $1 AND yymm = $2', [empId, targetYYMM]);
      if (result.rowCount === 0) {
        return res.json({ totalAdvance: 0, entries: {} });
      }
      const row = result.rows[0];
      const entries = typeof row.entries === 'string' ? JSON.parse(row.entries) : (row.entries || {});
      const enrichedEntries: Record<string, any> = {};
      Object.entries(entries).forEach(([key, entry]: [string, any]) => {
        enrichedEntries[key] = {
          ...entry,
          yymm: row.yymm
        };
      });
      res.json({
        totalAdvance: parseFloat(row.total_advance || 0),
        entries: enrichedEntries
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve advances' });
  }
});

// HRMS API: Dashboard stats
app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const currentMonthPattern = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-%`;
    const [empRes, deptRes, holidayRes] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM employees WHERE status = 'active'"),
      pool.query("SELECT COUNT(*) FROM departments"),
      pool.query("SELECT COUNT(*) FROM holidays WHERE date LIKE $1", [currentMonthPattern])
    ]);
    res.json({
      activeEmployees: parseInt(empRes.rows[0].count || 0, 10),
      totalDepartments: parseInt(deptRes.rows[0].count || 0, 10),
      upcomingHolidays: parseInt(holidayRes.rows[0].count || 0, 10)
    });
  } catch (err) {
    console.error('Failed to get dashboard stats', err);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// HRMS API: Attendance
app.get('/api/attendance/date/:dateStr', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM attendance WHERE date = $1', [req.params.dateStr]);
    res.json(result.rows.map(r => ({
      empId: r.emp_id,
      date: r.date,
      checkInLocal: r.check_in_local,
      checkOutLocal: r.check_out_local,
      checkInServer: r.check_in_server,
      checkOutServer: r.check_out_server,
      status: r.status,
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : r.metrics
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get attendance for date' });
  }
});

app.get('/api/attendance/monthly/:empId', authenticate, async (req, res) => {
  const yymm = req.query.yymm as string || getYYMM();
  const year = '20' + yymm.slice(0, 2);
  const month = yymm.slice(2);
  const pattern = `${year}-${month}-%`;
  try {
    const result = await pool.query('SELECT * FROM attendance WHERE emp_id = $1 AND date LIKE $2', [req.params.empId, pattern]);
    res.json(result.rows.map(r => ({
      empId: r.emp_id,
      date: r.date,
      checkInLocal: r.check_in_local,
      checkOutLocal: r.check_out_local,
      checkInServer: r.check_in_server,
      checkOutServer: r.check_out_server,
      status: r.status,
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : r.metrics
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get monthly attendance' });
  }
});

app.post('/api/attendance/manual', authenticate, async (req, res) => {
  const { empId, date, checkInLocal, checkOutLocal } = req.body;
  try {
    await pool.query(
      `INSERT INTO attendance (emp_id, date, check_in_local, check_out_local, check_in_server, check_out_server)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (emp_id, date)
       DO UPDATE SET
         check_in_local = EXCLUDED.check_in_local,
         check_out_local = EXCLUDED.check_out_local,
         check_out_server = CURRENT_TIMESTAMP`,
      [empId, date, checkInLocal || '--', checkOutLocal || '--']
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save manual attendance' });
  }
});

// HRMS API: Legacy Cloud Attendance Sync Simulation
app.get('/api/legacy/attendance/:yymm/:dd', authenticate, async (req, res) => {
  const { yymm, dd } = req.params;
  try {
    const empRes = await pool.query("SELECT id FROM employees WHERE status = 'active'");
    const records = empRes.rows.map(emp => {
      // Random check-in between 09:20 and 09:40
      const inMin = Math.floor(Math.random() * 20) + 20; 
      const checkInLocal = `09:${inMin}`;
      // Random check-out between 18:25 and 18:45
      const outMin = Math.floor(Math.random() * 20) + 25; 
      const checkOutLocal = `18:${outMin}`;
      return {
        empId: emp.id,
        checkInLocal,
        checkOutLocal
      };
    });
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch legacy attendance data' });
  }
});

app.post('/api/legacy/import', authenticate, async (req, res) => {
  const { yymm, dd, records } = req.body;
  const year = '20' + yymm.slice(0, 2);
  const month = yymm.slice(2);
  const dateStr = `${year}-${month}-${dd}`;
  try {
    for (const rec of records) {
      await pool.query(
        `INSERT INTO attendance (emp_id, date, check_in_local, check_out_local, check_in_server, check_out_server)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (emp_id, date)
         DO UPDATE SET
           check_in_local = EXCLUDED.check_in_local,
           check_out_local = EXCLUDED.check_out_local,
           check_out_server = CURRENT_TIMESTAMP`,
        [rec.empId, dateStr, rec.checkInLocal, rec.checkOutLocal]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to import legacy attendance records' });
  }
});

// HRMS API: Payroll Processing
app.post('/api/payroll/bulk/:yymm', authenticate, async (req, res) => {
  const { yymm } = req.params;
  const report = req.body;
  try {
    await pool.query(
      `INSERT INTO payroll_bulk (yymm, report_data) VALUES ($1, $2)
       ON CONFLICT (yymm) DO UPDATE SET report_data = EXCLUDED.report_data`,
      [yymm, JSON.stringify(report)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save bulk payroll report' });
  }
});

app.post('/api/payroll/individual/:yymm/:empId', authenticate, async (req, res) => {
  const { yymm, empId } = req.params;
  const calcData = req.body;
  try {
    await pool.query(
      `INSERT INTO payroll_individual (yymm, emp_id, calc_data) VALUES ($1, $2, $3)
       ON CONFLICT (yymm, emp_id) DO UPDATE SET calc_data = EXCLUDED.calc_data`,
      [yymm, empId, JSON.stringify(calcData)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save individual payroll record' });
  }
});

app.get('/api/payroll/report/:yymm', authenticate, async (req, res) => {
  const { yymm } = req.params;
  try {
    const result = await pool.query('SELECT report_data FROM payroll_bulk WHERE yymm = $1', [yymm]);
    if (result.rowCount === 0) {
      return res.json(null);
    }
    res.json(typeof result.rows[0].report_data === 'string' ? JSON.parse(result.rows[0].report_data) : result.rows[0].report_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get payroll report' });
  }
});

// Config Settings Routes
app.get('/api/settings/config', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM system_config WHERE id = $1', ['default']);
    const config = result.rows[0]?.data || null;
    res.json(config);
  } catch (err) {
    console.error('Failed to get config', err);
    res.status(500).json({ error: 'Failed to retrieve config' });
  }
});

app.post('/api/settings/config', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query(
      'INSERT INTO system_config (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
      ['default', JSON.stringify(req.body)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to write config', err);
    res.status(500).json({ error: 'Failed to write config' });
  }
});

// Companies Routes
app.get('/api/companies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to get companies', err);
    res.status(500).json({ error: 'Failed to retrieve companies' });
  }
});

app.post('/api/companies', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const id = 'company-' + Date.now();
    await pool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [id, name.trim()]);
    res.json({ id, name: name.trim() });
  } catch (err) {
    console.error('Failed to add company', err);
    res.status(500).json({ error: 'Failed to add company' });
  }
});

app.put('/api/companies/:id', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    await pool.query('UPDATE companies SET name = $1 WHERE id = $2', [name.trim(), req.params.id]);
    res.json({ id: req.params.id, name: name.trim() });
  } catch (err) {
    console.error('Failed to update company', err);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

app.delete('/api/companies/:id', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete company', err);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// Material Stocks Routes
app.get('/api/material-stocks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM material_stocks ORDER BY name ASC');
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      reorderLevel: parseFloat(row.reorder_level) || 0
    })));
  } catch (err) {
    console.error('Failed to get material stocks', err);
    res.status(500).json({ error: 'Failed to retrieve material stocks' });
  }
});

app.post('/api/material-stocks', async (req: any, res) => {
  try {
    const { name, quantity, unit, reorderLevel } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const id = 'stock-' + Date.now();
    await pool.query(
      'INSERT INTO material_stocks (id, name, quantity, unit, reorder_level) VALUES ($1, $2, $3, $4, $5)', 
      [id, name.trim(), parseFloat(quantity) || 0, (unit || 'pcs').trim(), parseFloat(reorderLevel) || 0]
    );
    res.json({ id, name: name.trim(), quantity: parseFloat(quantity) || 0, unit: (unit || 'pcs').trim(), reorderLevel: parseFloat(reorderLevel) || 0 });
  } catch (err: any) {
    console.error('Failed to add material stock', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A material with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to add material stock' });
  }
});

app.put('/api/material-stocks/:id', async (req: any, res) => {
  try {
    const { name, quantity, unit, reorderLevel } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    await pool.query(
      'UPDATE material_stocks SET name = $1, quantity = $2, unit = $3, reorder_level = $4 WHERE id = $5',
      [name.trim(), parseFloat(quantity) || 0, (unit || 'pcs').trim(), parseFloat(reorderLevel) || 0, req.params.id]
    );
    res.json({ id: req.params.id, name: name.trim(), quantity: parseFloat(quantity) || 0, unit: (unit || 'pcs').trim(), reorderLevel: parseFloat(reorderLevel) || 0 });
  } catch (err: any) {
    console.error('Failed to update material stock', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A material with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to update material stock' });
  }
});

// PATCH – update only the reorder level for a stock item
app.patch('/api/material-stocks/:id/reorder-level', async (req: any, res) => {
  try {
    const { reorderLevel } = req.body;
    await pool.query(
      'UPDATE material_stocks SET reorder_level = $1 WHERE id = $2',
      [parseFloat(reorderLevel) || 0, req.params.id]
    );
    res.json({ success: true, reorderLevel: parseFloat(reorderLevel) || 0 });
  } catch (err) {
    console.error('Failed to update reorder level', err);
    res.status(500).json({ error: 'Failed to update reorder level' });
  }
});

// PATCH – increment stock quantity for an item (refill)
app.patch('/api/material-stocks/:id/refill', async (req: any, res) => {
  try {
    const { addQuantity } = req.body;
    if (addQuantity === undefined || isNaN(addQuantity) || parseFloat(addQuantity) <= 0) {
      return res.status(400).json({ error: 'Valid addQuantity is required' });
    }
    const result = await pool.query(
      'UPDATE material_stocks SET quantity = quantity + $1 WHERE id = $2 RETURNING *',
      [parseFloat(addQuantity), req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Material stock not found' });
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      reorderLevel: parseFloat(row.reorder_level) || 0
    });
  } catch (err) {
    console.error('Failed to refill stock', err);
    res.status(500).json({ error: 'Failed to refill stock' });
  }
});

app.delete('/api/material-stocks/:id', async (req: any, res) => {
  try {
    await pool.query('DELETE FROM material_stocks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete material stock', err);
    res.status(500).json({ error: 'Failed to delete material stock' });
  }
});

// ─── Material Issues / Production Log Routes ──────────────────────────────

app.get('/api/material-issues', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM material_issues ORDER BY issued_at DESC');
    res.json(result.rows.map((row: any) => ({
      id: row.id,
      materialId: row.material_id,
      materialName: row.material_name,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      issuedTo: row.issued_to,
      notes: row.notes || '',
      issuedAt: row.issued_at
    })));
  } catch (err) {
    console.error('Failed to get material issues', err);
    res.status(500).json({ error: 'Failed to retrieve production log' });
  }
});

app.post('/api/material-issues', async (req: any, res) => {
  try {
    const { materialId, materialName, quantity, unit, issuedTo, notes } = req.body;
    if (!materialName || !issuedTo) return res.status(400).json({ error: 'Material name and issued-to are required' });
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });

    if (materialId) {
      const stockRow = await pool.query('SELECT quantity FROM material_stocks WHERE id = $1', [materialId]);
      if (stockRow.rows.length > 0) {
        const newQty = Math.max(0, parseFloat(stockRow.rows[0].quantity) - parseFloat(quantity));
        await pool.query('UPDATE material_stocks SET quantity = $1 WHERE id = $2', [newQty, materialId]);
      }
    }

    const id = 'issue-' + Date.now();
    await pool.query(
      'INSERT INTO material_issues (id, material_id, material_name, quantity, unit, issued_to, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, materialId || '', materialName, parseFloat(quantity), unit || 'pcs', issuedTo.trim(), notes || '']
    );
    res.json({ id, materialId: materialId || '', materialName, quantity: parseFloat(quantity), unit: unit || 'pcs', issuedTo: issuedTo.trim(), notes: notes || '', issuedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Failed to create material issue', err);
    res.status(500).json({ error: 'Failed to issue material' });
  }
});

app.delete('/api/material-issues/:id', async (req: any, res) => {
  try {
    await pool.query('DELETE FROM material_issues WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete material issue', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// ─── Material Requests / Approval Routes ───────────────────────────────────

app.post('/api/material-requests', async (req: any, res) => {
  try {
    const { materialId, materialName, requestedQuantity, unit, requestedBy, notes } = req.body;
    if (!materialName || !requestedQuantity || !requestedBy) {
      return res.status(400).json({ error: 'Material name, quantity, and requester name are required' });
    }
    const id = 'req-' + Date.now();
    await pool.query(
      `INSERT INTO material_requests (id, material_id, material_name, requested_quantity, unit, requested_by, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, materialId || null, materialName.trim(), parseFloat(requestedQuantity), (unit || 'pcs').trim(), requestedBy.trim(), notes || '']
    );
    res.json({ id, success: true });
  } catch (err) {
    console.error('Failed to create material request', err);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

app.get('/api/material-requests', async (req, res) => {
  try {
    const { status } = req.query;
    let queryStr = 'SELECT * FROM material_requests';
    const params: any[] = [];
    if (status) {
      queryStr += ' WHERE status = $1';
      params.push(status);
    }
    queryStr += ' ORDER BY requested_at DESC';
    const result = await pool.query(queryStr, params);
    res.json(result.rows.map((row: any) => ({
      id: row.id,
      materialId: row.material_id,
      materialName: row.material_name,
      requestedQuantity: parseFloat(row.requested_quantity),
      unit: row.unit,
      requestedBy: row.requested_by,
      notes: row.notes || '',
      status: row.status,
      approvedQuantity: row.approved_quantity ? parseFloat(row.approved_quantity) : null,
      approvedBy: row.approved_by || '',
      approvalNotes: row.approval_notes || '',
      requestedAt: row.requested_at,
      approvedAt: row.approved_at
    })));
  } catch (err) {
    console.error('Failed to fetch material requests', err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

app.post('/api/material-requests/:id/approve', async (req: any, res) => {
  const { id } = req.params;
  const { approvedQuantity, approvalNotes, approvedBy } = req.body;
  if (approvedQuantity === undefined || isNaN(approvedQuantity) || parseFloat(approvedQuantity) <= 0) {
    return res.status(400).json({ error: 'Valid approved quantity is required' });
  }
  try {
    const reqRes = await pool.query('SELECT * FROM material_requests WHERE id = $1', [id]);
    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const request = reqRes.rows[0];
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is already processed' });
    }

    const appQty = parseFloat(approvedQuantity);
    const appNotes = approvalNotes || '';
    const appBy = approvedBy || 'Admin';

    await pool.query(
      `UPDATE material_requests 
       SET status = 'approved', approved_quantity = $1, approved_by = $2, approval_notes = $3, approved_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [appQty, appBy, appNotes, id]
    );

    const materialId = request.material_id;
    if (materialId) {
      const stockRes = await pool.query('SELECT quantity FROM material_stocks WHERE id = $1', [materialId]);
      if (stockRes.rowCount! > 0) {
        const currentStock = parseFloat(stockRes.rows[0].quantity);
        const newQty = Math.max(0, currentStock - appQty);
        await pool.query('UPDATE material_stocks SET quantity = $1 WHERE id = $2', [newQty, materialId]);
      }
    }

    const issueId = 'issue-' + Date.now();
    const issuedTo = `Approved Req for ${request.requested_by}`;
    const issueNote = `Approved Qty: ${appQty} (Requested: ${request.requested_quantity}). Note: ${appNotes}`;

    await pool.query(
      `INSERT INTO material_issues (id, material_id, material_name, quantity, unit, issued_to, notes, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [issueId, materialId || '', request.material_name, appQty, request.unit || 'pcs', issuedTo, issueNote]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to approve request', err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

app.post('/api/material-requests/:id/reject', async (req: any, res) => {
  const { id } = req.params;
  const { approvalNotes, approvedBy } = req.body;
  try {
    const reqRes = await pool.query('SELECT * FROM material_requests WHERE id = $1', [id]);
    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const request = reqRes.rows[0];
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is already processed' });
    }

    await pool.query(
      `UPDATE material_requests 
       SET status = 'rejected', approved_by = $1, approval_notes = $2, approved_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [approvedBy || 'Admin', approvalNotes || '', id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to reject request', err);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// Proxy endpoint to bypass CORS for AWS Lambda status verification
app.get('/api/aws-ping', async (req: any, res) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }
  try {
    const response = await fetch(target as string);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('CORS Bypass Proxy Error:', err);
    res.status(502).json({ error: 'AWS Lambda unreachable' });
  }
});

// Clients Routes
app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients');
    const clients = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      company: row.company,
      city: row.city,
      profitMargins: row.profit_margins,
      mobile: row.mobile || '',
      address: row.address || '',
      gstin: row.gstin || ''
    }));
    res.json(clients);
  } catch (err) {
    console.error('Failed to get clients', err);
    res.status(500).json({ error: 'Failed to retrieve clients' });
  }
});

app.post('/api/clients', authenticate, async (req, res) => {
  try {
    const id = Date.now().toString();
    const { name, company, city, profitMargins, mobile = '', address = '', gstin = '' } = req.body;
    await pool.query(
      'INSERT INTO clients (id, name, company, city, profit_margins, mobile, address, gstin) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, name, company, city, JSON.stringify(profitMargins), mobile, address, gstin]
    );
    res.json({ id, name, company, city, profitMargins, mobile, address, gstin });
  } catch (err) {
    console.error('Failed to create client', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.put('/api/clients/:id', authenticate, async (req, res) => {
  try {
    const { name, company, city, profitMargins, mobile, address, gstin } = req.body;
    
    // Fetch existing to merge
    const existRes = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (existRes.rowCount === 0) return res.status(404).json({ error: 'Client not found' });
    const existing = existRes.rows[0];

    const updName = name !== undefined ? name : existing.name;
    const updCompany = company !== undefined ? company : existing.company;
    const updCity = city !== undefined ? city : existing.city;
    const updProfitMargins = profitMargins !== undefined ? profitMargins : existing.profit_margins;
    const updMobile = mobile !== undefined ? mobile : existing.mobile;
    const updAddress = address !== undefined ? address : existing.address;
    const updGstin = gstin !== undefined ? gstin : existing.gstin;

    const result = await pool.query(
      'UPDATE clients SET name = $1, company = $2, city = $3, profit_margins = $4, mobile = $5, address = $6, gstin = $7 WHERE id = $8 RETURNING *',
      [updName, updCompany, updCity, JSON.stringify(updProfitMargins), updMobile, updAddress, updGstin, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Client not found' });
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      company: row.company,
      city: row.city,
      profitMargins: row.profit_margins,
      mobile: row.mobile || '',
      address: row.address || '',
      gstin: row.gstin || ''
    });
  } catch (err) {
    console.error('Failed to update client', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

app.delete('/api/clients/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete client', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// Beltcut Pro Rolls & Cuts Routes
app.get('/api/rolls', async (req, res) => {
  try {
    const rollsRes = await pool.query('SELECT * FROM rolls WHERE is_archived = false');
    const cutsRes = await pool.query('SELECT * FROM cuts');
    
    const rolls = rollsRes.rows.map(r => ({
      id: r.id,
      materialType: r.material_type,
      fullWidth: parseFloat(r.full_width),
      fullLength: parseFloat(r.full_length),
      totalSqm: parseFloat(r.total_sqm),
      remainingSqm: parseFloat(r.remaining_sqm),
      isArchived: r.is_archived,
      isReuse: r.is_reuse || (r.id && (r.id.startsWith('REUSE-') || r.id.startsWith('INV-') || r.id.startsWith('SCRAP-'))) || false,
      parentRollId: r.parent_roll_id || null,
      status: r.status || 'active',
      reorderLevel: parseFloat(r.reorder_level || 0),
      cuts: cutsRes.rows
        .filter(c => c.roll_id === r.id)
        .map(c => ({
          id: c.id,
          orderId: c.order_id,
          customerName: c.customer_name,
          width: parseFloat(c.width),
          length: parseFloat(c.length),
          x: parseFloat(c.x),
          y: parseFloat(c.y),
          status: c.status,
          color: c.color,
          isInventoryCut: c.is_inventory_cut,
          soNumber: c.so_number || null
        }))
    }));
    res.json(rolls);
  } catch (err) {
    console.error('Failed to fetch rolls', err);
    res.status(500).json({ error: 'Failed to fetch rolls' });
  }
});

app.post('/api/rolls', async (req, res) => {
  const { id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived, isReuse, parentRollId, status } = req.body;
  const computedIsReuse = isReuse || (id && id.startsWith('REUSE-')) || false;
  try {
    await pool.query(
      `INSERT INTO rolls (id, material_type, full_width, full_length, total_sqm, remaining_sqm, is_archived, is_reuse, parent_roll_id, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived || false, computedIsReuse, parentRollId || null, status || 'active']
    );
    res.json({ id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived: isArchived || false, isReuse: computedIsReuse, parentRollId: parentRollId || null, status: status || 'active', cuts: [] });
  } catch (err) {
    console.error('Failed to create roll', err);
    res.status(500).json({ error: 'Failed to create roll' });
  }
});

app.put('/api/rolls/:id', async (req, res) => {
  const { remainingSqm, status } = req.body;
  try {
    if (status !== undefined) {
      await pool.query(
        'UPDATE rolls SET remaining_sqm = COALESCE($1, remaining_sqm), status = $2 WHERE id = $3',
        [remainingSqm, status, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE rolls SET remaining_sqm = $1 WHERE id = $2',
        [remainingSqm, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update roll', err);
    res.status(500).json({ error: 'Failed to update roll' });
  }
});

app.patch('/api/rolls/:id/reorder', async (req, res) => {
  const { reorderLevel } = req.body;
  try {
    await pool.query(
      'UPDATE rolls SET reorder_level = $1 WHERE id = $2',
      [parseFloat(reorderLevel) || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update roll reorder level', err);
    res.status(500).json({ error: 'Failed to update reorder level' });
  }
});

app.get('/api/material-type-reorders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM material_type_reorders');
    res.json(result.rows.map(r => ({ materialType: r.material_type, reorderLevel: parseFloat(r.reorder_level || 0) })));
  } catch (err) {
    console.error('Failed to fetch material type reorders', err);
    res.status(500).json({ error: 'Failed to fetch material type reorders' });
  }
});

app.patch('/api/material-type-reorders', async (req, res) => {
  const { materialType, reorderLevel } = req.body;
  try {
    await pool.query(
      `INSERT INTO material_type_reorders (material_type, reorder_level)
       VALUES ($1, $2)
       ON CONFLICT (material_type)
       DO UPDATE SET reorder_level = EXCLUDED.reorder_level`,
      [materialType, parseFloat(reorderLevel) || 0]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update material type reorder level', err);
    res.status(500).json({ error: 'Failed to update material type reorder level' });
  }
});

// GET custom material types
app.get('/api/material-types', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM custom_material_types ORDER BY name ASC');
    res.json(result.rows.map(r => r.name));
  } catch (err) {
    console.error('Failed to fetch custom material types', err);
    res.status(500).json({ error: 'Failed to fetch custom material types' });
  }
});

// POST custom material type
app.post('/api/material-types', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Material type name is required' });
  }
  try {
    await pool.query(
      'INSERT INTO custom_material_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name.trim()]
    );
    res.json({ success: true, name: name.trim() });
  } catch (err) {
    console.error('Failed to save custom material type', err);
    res.status(500).json({ error: 'Failed to save custom material type' });
  }
});

// PUT (update) custom material type
app.put('/api/material-types/:oldName', async (req, res) => {
  const { oldName } = req.params;
  const { newName } = req.body;
  if (!newName || !newName.trim()) {
    return res.status(400).json({ error: 'New name is required' });
  }
  try {
    const result = await pool.query(
      'UPDATE custom_material_types SET name = $1 WHERE name = $2 RETURNING *',
      [newName.trim(), oldName]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Material type not found' });
    }
    
    // Also update existing rolls using this material type
    await pool.query(
      'UPDATE rolls SET material_type = $1 WHERE material_type = $2',
      [newName.trim(), oldName]
    );

    res.json({ success: true, name: newName.trim() });
  } catch (err) {
    console.error('Failed to update custom material type', err);
    res.status(500).json({ error: 'Failed to update custom material type' });
  }
});

// DELETE custom material type
app.delete('/api/material-types/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM custom_material_types WHERE name = $1 RETURNING *',
      [name]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Material type not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete custom material type', err);
    res.status(500).json({ error: 'Failed to delete custom material type' });
  }
});

app.delete('/api/rolls/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM rolls WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete roll', err);
    res.status(500).json({ error: 'Failed to delete roll' });
  }
});

app.post('/api/rolls/:rollId/cuts', async (req, res) => {
  const { id, orderId, customerName, width, length, x, y, status, color, isInventoryCut, soNumber } = req.body;
  const rollId = req.params.rollId;
  try {
    await pool.query(
      `INSERT INTO cuts (id, roll_id, order_id, customer_name, width, length, x, y, status, color, is_inventory_cut, so_number) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, rollId, orderId, customerName, width, length, x, y, status, color, isInventoryCut || false, soNumber || null]
    );
    res.json({ id, orderId, customerName, width, length, x, y, status, color, isInventoryCut, soNumber });
  } catch (err) {
    console.error('Failed to save cut', err);
    res.status(500).json({ error: 'Failed to save cut' });
  }
});

app.delete('/api/rolls/:rollId/cuts/:cutId', async (req, res) => {
  const { rollId, cutId } = req.params;
  try {
    const cutRes = await pool.query('SELECT * FROM cuts WHERE id = $1 AND roll_id = $2', [cutId, rollId]);
    if (cutRes.rowCount === 0) {
      return res.status(404).json({ error: 'Cut not found' });
    }
    const cut = cutRes.rows[0];
    const cutArea = parseFloat(cut.width) * parseFloat(cut.length);

    await pool.query('DELETE FROM cuts WHERE id = $1 AND roll_id = $2', [cutId, rollId]);

    const rollRes = await pool.query('SELECT * FROM rolls WHERE id = $1', [rollId]);
    if (rollRes.rowCount && rollRes.rowCount > 0) {
      const roll = rollRes.rows[0];
      const newRemainingSqm = parseFloat(roll.remaining_sqm) + cutArea;
      const totalSqm = parseFloat(roll.total_sqm);
      const finalRemaining = Math.min(totalSqm, newRemainingSqm);
      await pool.query('UPDATE rolls SET remaining_sqm = $1 WHERE id = $2', [finalRemaining, rollId]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete cut', err);
    res.status(500).json({ error: 'Failed to delete cut' });
  }
});



// ─── Smart Cut API Endpoint ──────────────────────────────────────────────────
app.post('/api/quotations/:id/smart-cut', authenticate, async (req: any, res) => {
  const quotationId = req.params.id;
  try {
    const quoteRes = await pool.query('SELECT client_name FROM quotations WHERE id = $1', [quotationId]);
    if (quoteRes.rowCount === 0) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    const clientName = quoteRes.rows[0].client_name || 'Unknown';
    const plan = await smartCutForQuotation(quotationId, clientName);
    res.json(plan);
  } catch (err: any) {
    console.error('Smart cut failed:', err);
    res.status(500).json({ error: err.message || 'Smart cut failed' });
  }
});

// Quotations Routes
app.get('/api/quotations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM quotations');
    const quotations = result.rows.map(row => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      beltType: row.belt_type,
      beltStyle: row.belt_style,
      selectedBOMOptions: typeof row.selected_bom_options === 'string' ? JSON.parse(row.selected_bom_options) : (row.selected_bom_options || {}),
      dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : row.dimensions,
      jointType: row.joint_type,
      tapeType: row.tape_type,
      totalCost: parseFloat(row.total_cost),
      status: row.status,
      discountRequested: row.discount_requested ? parseFloat(row.discount_requested) : undefined,
      discountReason: row.discount_reason,
      rejectionReason: row.rejection_reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      auditLogs: typeof row.audit_logs === 'string' ? JSON.parse(row.audit_logs) : row.audit_logs,
      company: row.company,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || [])
    }));
    res.json(quotations);
  } catch (err) {
    console.error('Failed to get quotations', err);
    res.status(500).json({ error: 'Failed to retrieve quotations' });
  }
});

app.post('/api/quotations', authenticate, async (req, res) => {
  try {
    const id = Date.now().toString();
    const { clientId, clientName, beltType = '', beltStyle = '', selectedBOMOptions = {}, dimensions = {}, jointType = '', tapeType = '', totalCost, status, discountRequested, discountReason, rejectionReason, createdBy, auditLogs, company, items = [] } = req.body;
    const now = new Date();
    await pool.query(
      `INSERT INTO quotations (
        id, client_id, client_name, belt_type, dimensions, joint_type, tape_type, 
        total_cost, status, discount_requested, discount_reason, rejection_reason, 
        created_by, created_at, updated_at, audit_logs, company, belt_style, selected_bom_options, items
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        id, clientId, clientName, beltType, JSON.stringify(dimensions), jointType || '', tapeType || '',
        totalCost, status, discountRequested || null, discountReason || null, rejectionReason || null,
        createdBy, now, now, JSON.stringify(auditLogs || []), company || null, beltStyle || '', JSON.stringify(selectedBOMOptions || {}),
        JSON.stringify(items || [])
      ]
    );
    res.json({
      id, clientId, clientName, beltType, beltStyle: beltStyle || '', selectedBOMOptions: selectedBOMOptions || {}, dimensions, jointType: jointType || '', tapeType: tapeType || '',
      totalCost, status, discountRequested, discountReason, rejectionReason,
      createdBy, createdAt: now.toISOString(), updatedAt: now.toISOString(), auditLogs: auditLogs || [],
      company, items: items || []
    });
  } catch (err) {
    console.error('Failed to create quotation', err);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

app.put('/api/quotations/:id', authenticate, async (req, res) => {
  try {
    // 1. Get the existing quotation
    const existRes = await pool.query('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
    if (existRes.rowCount === 0) return res.status(404).json({ error: 'Quotation not found' });
    const existing = existRes.rows[0];

    // 2. Merge request body with existing quotation
    const clientId = req.body.clientId !== undefined ? req.body.clientId : existing.client_id;
    const clientName = req.body.clientName !== undefined ? req.body.clientName : existing.client_name;
    const beltType = req.body.beltType !== undefined ? req.body.beltType : existing.belt_type;
    const beltStyle = req.body.beltStyle !== undefined ? req.body.beltStyle : existing.belt_style;
    const selectedBOMOptions = req.body.selectedBOMOptions !== undefined ? req.body.selectedBOMOptions : existing.selected_bom_options;
    const dimensions = req.body.dimensions !== undefined ? req.body.dimensions : existing.dimensions;
    const jointType = req.body.jointType !== undefined ? req.body.jointType : existing.joint_type;
    const tapeType = req.body.tapeType !== undefined ? req.body.tapeType : existing.tape_type;
    const totalCost = req.body.totalCost !== undefined ? req.body.totalCost : existing.total_cost;
    const status = req.body.status !== undefined ? req.body.status : existing.status;
    const discountRequested = req.body.discountRequested !== undefined ? req.body.discountRequested : existing.discount_requested;
    const discountReason = req.body.discountReason !== undefined ? req.body.discountReason : existing.discount_reason;
    const rejectionReason = req.body.rejectionReason !== undefined ? req.body.rejectionReason : existing.rejection_reason;
    const createdBy = req.body.createdBy !== undefined ? req.body.createdBy : existing.created_by;
    const auditLogs = req.body.auditLogs !== undefined ? req.body.auditLogs : existing.audit_logs;
    const company = req.body.company !== undefined ? req.body.company : existing.company;
    const items = req.body.items !== undefined ? req.body.items : existing.items;

    const oldStatus = existing.status;
    const newStatus = req.body.status !== undefined ? req.body.status : existing.status;

    // Perform stock deduction if transitioned to executed
    if (newStatus === 'executed' && oldStatus !== 'executed') {
      try {
        await deductStockForQuotation(req.params.id, req.body);
      } catch (stockErr) {
        console.error('Failed to deduct stock for quotation execution:', stockErr);
      }
    }

    const now = new Date();
    
    const result = await pool.query(
      `UPDATE quotations SET 
        client_id = $1, client_name = $2, belt_type = $3, dimensions = $4, 
        joint_type = $5, tape_type = $6, total_cost = $7, status = $8, 
        discount_requested = $9, discount_reason = $10, rejection_reason = $11, 
        created_by = $12, updated_at = $13, audit_logs = $14, company = $15,
        belt_style = $16, selected_bom_options = $17, items = $18
      WHERE id = $19 RETURNING *`,
      [
        clientId, clientName, beltType, typeof dimensions === 'string' ? dimensions : JSON.stringify(dimensions),
        jointType || '', tapeType || '', totalCost, status,
        discountRequested !== undefined && discountRequested !== null ? discountRequested : null,
        discountReason || null, rejectionReason || null,
        createdBy, now, typeof auditLogs === 'string' ? auditLogs : JSON.stringify(auditLogs || []), 
        company || null,
        beltStyle || '',
        typeof selectedBOMOptions === 'string' ? selectedBOMOptions : JSON.stringify(selectedBOMOptions || {}),
        typeof items === 'string' ? items : JSON.stringify(items || []),
        req.params.id
      ]
    );
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Quotation not found' });
    const row = result.rows[0];
    res.json({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      beltType: row.belt_type,
      beltStyle: row.belt_style,
      selectedBOMOptions: typeof row.selected_bom_options === 'string' ? JSON.parse(row.selected_bom_options) : row.selected_bom_options,
      dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : row.dimensions,
      jointType: row.joint_type,
      tapeType: row.tape_type,
      totalCost: parseFloat(row.total_cost),
      status: row.status,
      discountRequested: row.discount_requested ? parseFloat(row.discount_requested) : undefined,
      discountReason: row.discount_reason,
      rejectionReason: row.rejection_reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      auditLogs: typeof row.audit_logs === 'string' ? JSON.parse(row.audit_logs) : row.audit_logs,
      company: row.company,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || [])
    });
  } catch (err) {
    console.error('Failed to update quotation', err);
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

// Users Management Routes
app.get('/api/users', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query('SELECT id, username, name, role, username_lower, permission, allowed_pages FROM users');
    res.json(result.rows.map(row => ({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      usernameLower: row.username_lower,
      permission: row.permission || 'write',
      allowedPages: row.role === 'admin'
        ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production', 'nesting_dashboard', 'nesting_cutting', 'nesting_rolls_map', 'nesting_details', 'nesting_stock', 'nesting_production', 'nesting_scrub']
        : (row.allowed_pages || 'dashboard,calculator,quotations,clients').split(',')
    })));
  } catch (err) {
    console.error('Failed to get users', err);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

app.post('/api/users', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, name, role, password, permission = 'write', allowedPages = ['dashboard', 'calculator', 'quotations', 'clients'] } = req.body;
  
  try {
    const normalizedUsername = username.toLowerCase().trim().replace(/\s+/g, '_');
    
    const checkUser = await pool.query('SELECT 1 FROM users WHERE username_lower = $1', [normalizedUsername]);
    if (checkUser.rowCount! > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
  
    const passwordHash = bcrypt.hashSync(password, 10);
    const allowedPagesStr = Array.isArray(allowedPages) ? allowedPages.join(',') : 'dashboard,calculator,quotations,clients';
    await pool.query(
      'INSERT INTO users (id, username, name, role, password, username_lower, permission, allowed_pages) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [normalizedUsername, username, name, role, passwordHash, normalizedUsername, permission, allowedPagesStr]
    );
    res.json({
      id: normalizedUsername,
      username,
      name,
      role,
      usernameLower: normalizedUsername,
      permission,
      allowedPages: role === 'admin'
        ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production', 'nesting_dashboard', 'nesting_cutting', 'nesting_rolls_map', 'nesting_details', 'nesting_stock', 'nesting_production', 'nesting_scrub']
        : allowedPages
    });
  } catch (err) {
    console.error('Failed to create user', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { name, role, permission, allowedPages, password } = req.body;
  try {
    const allowedPagesStr = Array.isArray(allowedPages) ? allowedPages.join(',') : 'dashboard,calculator,quotations,clients';
    
    let query = 'UPDATE users SET name = $1, role = $2, permission = $3, allowed_pages = $4 WHERE id = $5';
    let params = [name, role, permission, allowedPagesStr, req.params.id];

    if (password && password.trim() !== '') {
      const passwordHash = bcrypt.hashSync(password, 10);
      query = 'UPDATE users SET name = $1, role = $2, permission = $3, allowed_pages = $4, password = $5 WHERE id = $6';
      params = [name, role, permission, allowedPagesStr, passwordHash, req.params.id];
    }

    const result = await pool.query(
      query + ' RETURNING id, username, name, role, permission, allowed_pages',
      params
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      permission: row.permission,
      allowedPages: row.role === 'admin'
        ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production', 'nesting_dashboard', 'nesting_cutting', 'nesting_rolls_map', 'nesting_details', 'nesting_stock', 'nesting_production', 'nesting_scrub']
        : (row.allowed_pages || '').split(',')
    });
  } catch (err) {
    console.error('Failed to update user', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete user', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Audit / Activity Logs Routes
app.get('/api/audit-logs', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100');
    res.json(result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      userName: row.user_name,
      action: row.action,
      details: row.details
    })));
  } catch (err) {
    console.error('Failed to get audit logs', err);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

app.post('/api/audit-logs', authenticate, async (req: any, res) => {
  try {
    const id = Date.now().toString();
    const now = new Date();
    const { action, details } = req.body;
    await pool.query(
      'INSERT INTO audit_logs (id, timestamp, user_id, user_name, action, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, now, req.user.id, req.user.name || req.user.username, action, details]
    );
    res.json({
      id,
      timestamp: now.toISOString(),
      userId: req.user.id,
      userName: req.user.name || req.user.username,
      action,
      details
    });
  } catch (err) {
    console.error('Failed to create audit log', err);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

// ─── PresencePro Static Serving ─────────────────────────────────────────────
// Serves the pre-built PresencePro SPA from /presence on the SAME port (3000).
// No separate port, no proxy, no Chrome Private Network Access issues.
const presenceDistPath = path.join(process.cwd(), 'presence-dist');

// Serve static assets (JS, CSS, images) under /presence
app.use('/presence', express.static(presenceDistPath));

// SPA fallback: any /presence/* route returns index.html for client-side routing
app.get(['/presence', '/presence/*'], (_req, res) => {
  res.sendFile(path.join(presenceDistPath, 'index.html'));
});
// ─────────────────────────────────────────────────────────────────────────────

// Vite Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Serve index.html transformed by Vite for all non-api, non-presence routes
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(
          path.resolve(__dirname, 'index.html'),
          'utf-8'
        );
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`PresencePro available at http://localhost:${PORT}/presence`);
    });
  }
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;
