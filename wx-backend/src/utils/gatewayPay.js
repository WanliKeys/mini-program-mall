const crypto = require('crypto');
const axios = require('axios');

const DEFAULT_BASE_URL = 'https://pay.prod.6jqb.com';
const DEFAULT_WAY_CODE = 'WX_LITE';
const DEFAULT_CURRENCY = 'cny';
const DEFAULT_VERSION = '1.0';

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

function normalizeSignValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildSignParams(params) {
  const filtered = {};

  Object.keys(params || {}).forEach((key) => {
    if (key === 'sign' || key === 'sign_type') return;

    const value = params[key];
    if (isEmpty(value)) return;

    filtered[key] = normalizeSignValue(value);
  });

  return Object.keys(filtered)
    .sort()
    .map((key) => `${key}=${filtered[key]}`)
    .join('&');
}

function signMd5(params, key) {
  const signString = `${buildSignParams(params)}&key=${key}`;
  return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
}

function verifyMd5(params, key) {
  const providedSign = normalizeSignValue(params.sign).toUpperCase();
  if (!providedSign) return false;
  return signMd5(params, key) === providedSign;
}

function resolveBaseUrl() {
  return (process.env.JQB_PAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function resolveNotifyUrl() {
  if (process.env.JQB_PAY_NOTIFY_URL) return process.env.JQB_PAY_NOTIFY_URL;

  const base = (process.env.PUBLIC_API_BASE || '').replace(/\/$/, '');
  if (!base) return '';

  return `${base}/payments/notify`;
}

function resolveReturnUrl() {
  if (process.env.JQB_PAY_RETURN_URL) return process.env.JQB_PAY_RETURN_URL;

  const base = (process.env.PUBLIC_WEB_BASE || '').replace(/\/$/, '');
  if (!base) return '';

  return `${base}/pay-return.html`;
}

function getRequiredConfig(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少支付配置：${name}`);
  }
  return String(value).trim();
}

function getGatewayConfig() {
  return {
    baseUrl: resolveBaseUrl(),
    mchNo: getRequiredConfig('JQB_PAY_MCH_NO'),
    appId: getRequiredConfig('JQB_PAY_APP_ID'),
    key: getRequiredConfig('JQB_PAY_KEY'),
    wayCode: process.env.JQB_PAY_WAY_CODE || DEFAULT_WAY_CODE,
    currency: process.env.JQB_PAY_CURRENCY || DEFAULT_CURRENCY,
    version: process.env.JQB_PAY_VERSION || DEFAULT_VERSION
  };
}

function toAmountInCents(amount) {
  const numericAmount = Number.parseFloat(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error(`支付金额无效: ${amount}`);
  }

  return Math.round(numericAmount * 100);
}

function buildChannelExtra(openid) {
  if (!openid) {
    throw new Error('缺少支付所需的 openid');
  }

  const extra = { openid };
  if (process.env.JQB_PAY_IS_SUB_OPENID === 'true') {
    extra.isSubOpenId = 1;
  }

  return JSON.stringify(extra);
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (err) {
    return value;
  }
}

function verifyResponseSign(response, key) {
  if (!response || !response.sign || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
    return;
  }

  const valid = verifyMd5(response.data, key);
  if (valid) return;

  const strict = process.env.JQB_PAY_STRICT_RESPONSE_SIGN === 'true';
  const logPayload = {
    code: response.code,
    msg: response.msg || '',
    providedSign: response.sign,
    data: response.data
  };

  if (strict) {
    throw new Error(`验签失败: ${JSON.stringify(logPayload)}`);
  }

  console.warn('⚠️ 6jqb 返回签名验证失败，已按非严格模式继续处理', logPayload);
}

async function postGateway(path, payload) {
  const { baseUrl } = getGatewayConfig();
  const url = `${baseUrl}${path}`;
  const debug = process.env.JQB_PAY_DEBUG === 'true';

  if (debug) {
    console.log('🧾 JQB_REQUEST', { url, payload });
  }

  const response = await axios.post(url, payload, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  });

  if (debug) {
    console.log('🧾 JQB_RESPONSE', { url, data: response.data });
  }

  return response.data;
}

function normalizeGatewayResponse(response, key) {
  if (!response || typeof response !== 'object') {
    throw new Error('支付网关返回异常：非 JSON 对象');
  }

  if (response.code !== 0 && response.code !== '0') {
    throw new Error(response.msg || `支付网关请求失败(code=${response.code})`);
  }

  verifyResponseSign(response, key);

  const data = response.data || {};
  return {
    code: response.code,
    msg: response.msg || '',
    sign: response.sign || '',
    data,
    payOrderId: data.payOrderId || '',
    mchOrderNo: data.mchOrderNo || '',
    orderState: Number.parseInt(data.orderState ?? data.state ?? '-1', 10),
    state: Number.parseInt(data.state ?? data.orderState ?? '-1', 10),
    payDataType: data.payDataType || '',
    payData: parseJsonMaybe(data.payData),
    outTransId: data.outTransId || '',
    channelOrderNo: data.channelOrderNo || '',
    raw: response
  };
}

function buildSignedPayload(payload) {
  const { mchNo, appId, key, version } = getGatewayConfig();
  const requestPayload = {
    mchNo,
    appId,
    reqTime: Date.now(),
    version,
    signType: 'MD5',
    ...payload
  };

  requestPayload.sign = signMd5(requestPayload, key);
  return { requestPayload, key };
}

async function createGatewayOrder({
  paymentNo,
  amount,
  clientIp,
  subject,
  body,
  openid,
  extParam = ''
}) {
  const notifyUrl = resolveNotifyUrl();
  if (!notifyUrl) {
    throw new Error('缺少支付回调地址：JQB_PAY_NOTIFY_URL 或 PUBLIC_API_BASE');
  }

  const returnUrl = resolveReturnUrl();
  const { wayCode, currency } = getGatewayConfig();
  const payload = {
    mchOrderNo: paymentNo,
    wayCode,
    amount: toAmountInCents(amount),
    currency,
    clientIp: clientIp || '',
    subject: subject || '商城订单',
    body: body || subject || '商城订单',
    notifyUrl,
    channelExtra: buildChannelExtra(openid)
  };

  if (returnUrl) payload.returnUrl = returnUrl;
  if (extParam) payload.extParam = extParam;
  if (process.env.JQB_PAY_EXPIRED_TIME) {
    payload.expiredTime = Number.parseInt(process.env.JQB_PAY_EXPIRED_TIME, 10);
  }

  const { requestPayload, key } = buildSignedPayload(payload);
  const response = await postGateway('/api/pay/unifiedOrder', requestPayload);
  return normalizeGatewayResponse(response, key);
}

async function queryGatewayOrder({ paymentNo = '', payOrderId = '' }) {
  if (!paymentNo && !payOrderId) {
    throw new Error('查询支付订单时必须传 paymentNo 或 payOrderId');
  }

  const payload = {};
  if (paymentNo) payload.mchOrderNo = paymentNo;
  if (payOrderId) payload.payOrderId = payOrderId;

  const { requestPayload, key } = buildSignedPayload(payload);
  const response = await postGateway('/api/pay/query', requestPayload);
  return normalizeGatewayResponse(response, key);
}

async function closeGatewayOrder({ paymentNo = '', payOrderId = '' }) {
  if (!paymentNo && !payOrderId) {
    throw new Error('关单时必须传 paymentNo 或 payOrderId');
  }

  const payload = {};
  if (paymentNo) payload.mchOrderNo = paymentNo;
  if (payOrderId) payload.payOrderId = payOrderId;

  const { requestPayload, key } = buildSignedPayload(payload);
  const response = await postGateway('/api/pay/order/close', requestPayload);
  return normalizeGatewayResponse(response, key);
}

module.exports = {
  buildSignParams,
  signMd5,
  verifyMd5,
  resolveNotifyUrl,
  resolveReturnUrl,
  createGatewayOrder,
  queryGatewayOrder,
  closeGatewayOrder
};
