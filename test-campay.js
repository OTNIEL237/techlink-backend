require('dotenv').config();
const service = require('./src/utils/camerpay.service');

async function test() {
  try {
    const res = await service.initializePayment({
      type: 'subscription',
      amount: 20000,
      description: 'Test Subscription',
      clientPhone: '671234567',
      reference: 'TEST_REF_' + Date.now(),
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(e);
  }
}

test();
