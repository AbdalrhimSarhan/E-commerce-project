import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import type { EntityManager } from 'typeorm';
import { flattenValidationErrors } from '../../common/exceptions/validation.exception';
import { CreateCategoryDto } from '../../modules/categories/dto/category.dto';
import { Category } from '../../modules/categories/entities/category.entity';
import { ProductCategory } from '../../modules/categories/entities/product-category.entity';
import { CreateProductDto } from '../../modules/products/dto/product.dto';
import { Product } from '../../modules/products/entities/product.entity';

/*
 * Demo catalog for local evaluation: 8 categories and 20 products of an
 * electronics / home / office store. It shows the many-to-many relationship:
 * several products are in 2 or 3 categories, "Clearance" has no products,
 * and 3 products have no category.
 */

export interface DemoCategory {
  name: string;
  description: string;
}

export interface DemoProduct {
  sku: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  isActive?: boolean;
  /** Category names (from DEMO_CATEGORIES). */
  categories: string[];
}

export const DEMO_CATEGORIES: DemoCategory[] = [
  {
    name: 'Laptops & Computers',
    description: 'Notebooks, desktops and mini PCs for work and play.',
  },
  {
    name: 'Monitors & Displays',
    description: 'Office, gaming and creator monitors.',
  },
  {
    name: 'Keyboards & Mice',
    description: 'Mechanical and membrane keyboards, mice and trackpads.',
  },
  {
    name: 'Audio',
    description: 'Headphones, earbuds, speakers and microphones.',
  },
  {
    name: 'Smart Home',
    description: 'Connected lighting, plugs, sensors and cameras.',
  },
  {
    name: 'Home Office',
    description: 'Everything for a productive desk at home.',
  },
  {
    name: 'Networking',
    description: 'Routers, mesh systems, switches and adapters.',
  },
  {
    name: 'Clearance',
    description: 'Last items at reduced prices. Currently empty.',
  },
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    sku: 'LAP-14-PRO',
    name: 'ProBook 14 Laptop',
    description: '14" 2.8K display, 16 GB RAM, 1 TB SSD, 18-hour battery.',
    price: '1299.00',
    stock: 12,
    categories: ['Laptops & Computers', 'Home Office'],
  },
  {
    sku: 'LAP-13-AIR',
    name: 'AirLite 13 Ultrabook',
    description: '1.1 kg aluminium ultrabook, 8 GB RAM, 512 GB SSD.',
    price: '899.00',
    stock: 20,
    categories: ['Laptops & Computers'],
  },
  {
    sku: 'PC-MINI-01',
    name: 'Mini PC N100',
    description: 'Palm-sized desktop with 16 GB RAM, dual HDMI and Wi-Fi 6.',
    price: '329.90',
    stock: 35,
    categories: ['Laptops & Computers', 'Home Office'],
  },
  {
    sku: 'MON-27-4K',
    name: '27" 4K IPS Monitor',
    description:
      '27-inch UHD panel, USB-C with 65 W power delivery, height-adjustable stand.',
    price: '449.00',
    stock: 18,
    categories: ['Monitors & Displays', 'Home Office'],
  },
  {
    sku: 'MON-34-UW',
    name: '34" Ultrawide Curved Monitor',
    description: '3440x1440, 144 Hz, 1500R curve for multitasking and games.',
    price: '599.00',
    stock: 7,
    categories: ['Monitors & Displays'],
  },
  {
    sku: 'MON-16-PORT',
    name: '16" Portable USB-C Monitor',
    description: 'Lightweight second screen powered by a single USB-C cable.',
    price: '179.00',
    stock: 25,
    categories: ['Monitors & Displays', 'Home Office', 'Laptops & Computers'],
  },
  {
    sku: 'KB-MECH-75',
    name: 'Mechanical Keyboard 75%',
    description: 'Hot-swappable switches, aluminium case, RGB backlight.',
    price: '139.90',
    stock: 40,
    categories: ['Keyboards & Mice', 'Home Office'],
  },
  {
    sku: 'KB-WL-SLIM',
    name: 'Slim Wireless Keyboard',
    description: 'Low-profile keys, Bluetooth for up to 3 devices.',
    price: '59.00',
    stock: 60,
    categories: ['Keyboards & Mice'],
  },
  {
    sku: 'MS-ERGO-V',
    name: 'Ergonomic Vertical Mouse',
    description:
      'Vertical grip that reduces wrist strain, 6 buttons, rechargeable.',
    price: '49.90',
    stock: 55,
    categories: ['Keyboards & Mice', 'Home Office'],
  },
  {
    sku: 'MS-GAME-PRO',
    name: 'Pro Gaming Mouse',
    description: '26k DPI optical sensor, 58 g lightweight shell.',
    price: '79.00',
    stock: 30,
    categories: ['Keyboards & Mice'],
  },
  {
    sku: 'AUD-ANC-H1',
    name: 'Noise-Cancelling Headphones H1',
    description:
      'Over-ear, adaptive ANC, 40-hour battery, multipoint Bluetooth.',
    price: '249.00',
    stock: 22,
    categories: ['Audio', 'Home Office'],
  },
  {
    sku: 'AUD-BUDS-2',
    name: 'True Wireless Earbuds 2',
    description: 'IPX4 earbuds with wireless charging case.',
    price: '99.00',
    stock: 80,
    categories: ['Audio'],
  },
  {
    sku: 'AUD-SPK-BT',
    name: 'Portable Bluetooth Speaker',
    description: 'Waterproof speaker with 20-hour playback.',
    price: '69.90',
    stock: 45,
    categories: ['Audio', 'Smart Home'],
  },
  {
    sku: 'AUD-MIC-USB',
    name: 'USB Condenser Microphone',
    description: 'Cardioid studio mic for calls, podcasts and streaming.',
    price: '89.00',
    stock: 16,
    categories: ['Audio', 'Home Office'],
  },
  {
    sku: 'SH-BULB-4',
    name: 'Smart LED Bulb (4-pack)',
    description: 'E27 colour bulbs, app and voice control, no hub needed.',
    price: '39.90',
    stock: 120,
    categories: ['Smart Home'],
  },
  {
    sku: 'SH-PLUG-2',
    name: 'Smart Plug with Energy Meter (2-pack)',
    description: 'Schedules, remote control and power monitoring.',
    price: '29.90',
    stock: 90,
    categories: ['Smart Home'],
  },
  {
    sku: 'NET-MESH-3',
    name: 'Wi-Fi 6 Mesh System (3-pack)',
    description: 'Whole-home coverage up to 500 m², 3 Gbit/s combined.',
    price: '279.00',
    stock: 14,
    categories: ['Networking', 'Smart Home'],
  },
  // No category (shows that a product does not need one):
  {
    sku: 'NET-SW-8P',
    name: '8-Port Gigabit Switch',
    description: 'Unmanaged metal desktop switch, fanless.',
    price: '34.90',
    stock: 50,
    categories: [],
  },
  {
    sku: 'ACC-HUB-7IN1',
    name: 'USB-C Hub 7-in-1',
    description: 'HDMI 4K, 3x USB-A, SD/microSD, 100 W pass-through charging.',
    price: '44.90',
    stock: 70,
    categories: [],
  },
  {
    sku: 'ACC-STAND-AL',
    name: 'Aluminium Laptop Stand',
    description: 'Foldable stand, six height levels. Discontinued model.',
    price: '24.90',
    stock: 0,
    isActive: false,
    categories: [],
  },
];

/** The product fields as the API's CreateProductDto expects them (the category names are linked separately). */
function productFields(product: DemoProduct): Record<string, unknown> {
  return {
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    ...(product.isActive !== undefined && { isActive: product.isActive }),
  };
}

export type DemoCatalogOutcome =
  | {
      status: 'created';
      categories: number;
      products: number;
      links: number;
      reusedCategories: string[];
    }
  | { status: 'skipped'; reason: 'disabled' | 'products_exist' };

/**
 * Validates the demo data with the API's own DTO classes and options (the
 * same rules as the global ValidationPipe), and checks that SKUs and
 * category names are unique (case-insensitive) and that every link points to
 * a known category. Throws one error listing every problem.
 */
export function validateDemoCatalog(
  categories: DemoCategory[] = DEMO_CATEGORIES,
  products: DemoProduct[] = DEMO_PRODUCTS,
): void {
  const problems: string[] = [];
  const options = { whitelist: true, forbidNonWhitelisted: true };
  const describe = (errors: ValidationError[]): string =>
    flattenValidationErrors(errors)
      .map((detail) => `${detail.field}: ${detail.message}`)
      .join('; ');

  for (const category of categories) {
    const errors = validateSync(
      plainToInstance(CreateCategoryDto, category),
      options,
    );
    if (errors.length > 0)
      problems.push(`category "${category.name}": ${describe(errors)}`);
  }
  for (const product of products) {
    const errors = validateSync(
      plainToInstance(CreateProductDto, productFields(product)),
      options,
    );
    if (errors.length > 0)
      problems.push(`product ${product.sku}: ${describe(errors)}`);
  }

  const names = categories.map((category) =>
    category.name.trim().toLowerCase(),
  );
  if (new Set(names).size !== names.length)
    problems.push('category names must be unique (case-insensitive)');
  const skus = products.map((product) => product.sku.trim().toUpperCase());
  if (new Set(skus).size !== skus.length) problems.push('SKUs must be unique');

  const known = new Set(names);
  for (const product of products) {
    for (const name of product.categories) {
      if (!known.has(name.toLowerCase()))
        problems.push(`product ${product.sku}: unknown category "${name}"`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid demo catalog:\n  - ${problems.join('\n  - ')}`);
  }
}

/**
 * Creates the demo catalog with the caller's EntityManager (i.e. inside the
 * seed's single transaction). Only when enabled AND the products table is
 * empty, so running the seed again creates nothing.
 *
 * No audit rows are written: this is initial data, not an action by a user
 * or an agent.
 */
export async function seedDemoCatalog(
  manager: EntityManager,
  enabled: boolean,
): Promise<DemoCatalogOutcome> {
  if (!enabled) {
    return { status: 'skipped', reason: 'disabled' };
  }
  if ((await manager.getRepository(Product).count()) > 0) {
    return { status: 'skipped', reason: 'products_exist' };
  }

  validateDemoCatalog();

  // Categories: reuse one that already exists with the same name (case-insensitive),
  // so the unique index on lower(name) can never make the seed fail.
  const categoryRepository = manager.getRepository(Category);
  const idsByName = new Map<string, string>();
  const reusedCategories: string[] = [];
  let createdCategories = 0;
  for (const demo of DEMO_CATEGORIES) {
    const dto = plainToInstance(CreateCategoryDto, demo);
    const existing = await categoryRepository
      .createQueryBuilder('category')
      .where('lower(category.name) = lower(:name)', { name: dto.name })
      .getOne();
    if (existing) {
      reusedCategories.push(existing.name);
      idsByName.set(demo.name.toLowerCase(), existing.id);
      continue;
    }
    const created = await categoryRepository.save(
      categoryRepository.create({
        name: dto.name,
        description: dto.description ?? null,
      }),
    );
    idsByName.set(demo.name.toLowerCase(), created.id);
    createdCategories += 1;
  }

  // Products, normalized exactly like the API does (trimmed, SKU uppercase, price string).
  const productRepository = manager.getRepository(Product);
  const links: Array<{ productId: string; categoryId: string }> = [];
  for (const demo of DEMO_PRODUCTS) {
    const dto = plainToInstance(CreateProductDto, productFields(demo));
    const product = await productRepository.save(
      productRepository.create({
        sku: dto.sku,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        stock: dto.stock ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
    for (const name of demo.categories) {
      links.push({
        productId: product.id,
        categoryId: idsByName.get(name.toLowerCase()) as string,
      });
    }
  }
  if (links.length > 0) {
    await manager.getRepository(ProductCategory).insert(links);
  }

  return {
    status: 'created',
    categories: createdCategories,
    products: DEMO_PRODUCTS.length,
    links: links.length,
    reusedCategories,
  };
}
