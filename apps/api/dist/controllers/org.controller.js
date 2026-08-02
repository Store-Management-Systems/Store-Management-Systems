"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrganization = createOrganization;
exports.getOrganizations = getOrganizations;
const index_1 = require("../index");
const zod_1 = require("zod");
const createOrgSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    code: zod_1.z.string().min(2).toUpperCase(),
    ownerName: zod_1.z.string().optional(),
    contactEmail: zod_1.z.string().email().optional(),
    contactPhone: zod_1.z.string().optional(),
});
async function createOrganization(request, reply) {
    try {
        const data = createOrgSchema.parse(request.body);
        const existingOrg = await index_1.prisma.organization.findUnique({
            where: { code: data.code }
        });
        if (existingOrg) {
            return reply.status(400).send({ error: 'Organization code already exists' });
        }
        const org = await index_1.prisma.organization.create({
            data: {
                name: data.name,
                code: data.code,
                ownerName: data.ownerName,
                contactEmail: data.contactEmail,
                contactPhone: data.contactPhone,
            }
        });
        return reply.status(201).send(org);
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return reply.status(400).send({ error: err.errors });
        }
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
async function getOrganizations(request, reply) {
    try {
        const orgs = await index_1.prisma.organization.findMany();
        return reply.send(orgs);
    }
    catch (err) {
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
