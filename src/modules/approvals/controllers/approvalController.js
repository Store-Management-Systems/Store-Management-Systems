const { db, success, error } = require('../../../shared');
const { executeApprovalPayload, processPendingAutoApprovals } = require('../services/approvalService');

const getApprovals = async (req, res) => {
    try {
        // Run auto-approval check on requests > 8 hours
        await processPendingAutoApprovals();

        let approvals = [];
        if (req.user.role === 'Admin') {
            approvals = await db.prepare("SELECT * FROM approvals ORDER BY created_at DESC").all();
        } else {
            approvals = await db.prepare("SELECT * FROM approvals WHERE requester_id = ? ORDER BY created_at DESC").all(req.user.id);
        }

        return success(res, 'Approvals retrieved', approvals);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const approveRequest = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Superadmin can manually approve requests', 403);
    }

    const { id } = req.params;
    try {
        const approval = await db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
        if (!approval) {
            return error(res, 'Approval request not found', 404);
        }

        if (approval.status !== 'pending') {
            return error(res, `Request is already ${approval.status}`, 400);
        }

        const ok = await executeApprovalPayload(approval);
        if (!ok) {
            return error(res, 'Failed to process approval action', 500);
        }

        return success(res, `Approval request '${approval.title}' approved successfully`);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const rejectRequest = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return error(res, 'Only Superadmin can reject requests', 403);
    }

    const { id } = req.params;
    try {
        const approval = await db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
        if (!approval) {
            return error(res, 'Approval request not found', 404);
        }

        if (approval.status !== 'pending') {
            return error(res, `Request is already ${approval.status}`, 400);
        }

        await db.prepare("UPDATE approvals SET status = 'rejected', processed_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

        const payload = JSON.parse(approval.payload || '{}');
        if (approval.type === 'branch_create' && payload.shopId) {
            await db.prepare("UPDATE shops SET status = 'rejected' WHERE id = ?").run(payload.shopId);
        } else if (approval.type === 'user_create' && payload.userId) {
            await db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(payload.userId);
        }

        return success(res, `Approval request '${approval.title}' rejected`);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = {
    getApprovals,
    approveRequest,
    rejectRequest
};
