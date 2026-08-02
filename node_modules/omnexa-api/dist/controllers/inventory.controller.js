"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCategory = createCategory;
exports.getCategories = getCategories;
exports.createProduct = createProduct;
exports.getProducts = getProducts;
const index_1 = require("../index");
const zod_1 = require("zod");
const createCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
});
async function createCategory(request, reply) {
    try {
        const data = createCategorySchema.parse(request.body);
        // Assuming organizationId is extracted from JWT token and attached to request.user
        const user = request.user;
        if (!user || !user.organizationId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const category = await index_1.prisma.category.create({
            data: {
                name: data.name,
                description: data.description,
                organizationId: user.organizationId,
            }
        });
        return reply.status(201).send(category);
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return reply.status(400).send({ error: err.errors });
        }
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
async function getCategories(request, reply) {
    try {
        const user = request.user;
        if (!user || !user.organizationId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const categories = await index_1.prisma.category.findMany({
            where: { organizationId: user.organizationId }
        });
        return reply.send(categories);
    }
    catch (err) {
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
const createProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    categoryId: zod_1.z.string().uuid().optional(),
    sku: zod_1.z.string().optional(),
    barcode: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    unit: zod_1.z.string().default('pcs'),
    sellingPrice: zod_1.z.number().min(0).default(0),
    costPrice: zod_1.z.number().min(0).default(0),
    taxRate: zod_1.z.number().min(0).default(0),
    isRawMaterial: zod_1.z.boolean().default(false),
});
async function createProduct(request, reply) {
    try {
        const data = createProductSchema.parse(request.body);
        const user = request.user;
        if (!user || !user.organizationId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const product = await index_1.prisma.product.create({
            data: {
                ...data,
                organizationId: user.organizationId,
            }
        });
        return reply.status(201).send(product);
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return reply.status(400).send({ error: err.errors });
        }
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
async function getProducts(request, reply) {
    try {
        const user = request.user;
        if (!user || !user.organizationId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const products = await index_1.prisma.product.findMany({
            where: { organizationId: user.organizationId },
            include: { category: true }
        });
        return reply.send(products);
    }
    catch (err) {
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
