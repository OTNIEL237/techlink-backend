const adminService = require('./admin.service');

const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, adminId, notes } = req.body;
    
    // action: 'refund_client', 'force_payment', 'neutral_cancel'

    if (!['refund_client', 'force_payment', 'neutral_cancel'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const result = await adminService.resolveDispute(id, action, adminId, notes);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error resolving dispute:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  resolveDispute
};
