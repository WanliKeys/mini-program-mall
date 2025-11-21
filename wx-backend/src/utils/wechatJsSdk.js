const axios = require('axios');
const crypto = require('crypto');

const cache = {
  accessToken: null,
  accessTokenExpiresAt: 0,
  jsapiTicket: null,
  jsapiTicketExpiresAt: 0
};

const APP_ID_KEYS = ['WECHAT_H5_APPID', 'REFERRAL_JS_APPID', 'WECHAT_APPID'];
const SECRET_KEYS = ['WECHAT_H5_SECRET', 'REFERRAL_JS_SECRET', 'WECHAT_SECRET'];

function resolveEnv(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return { key, value: value.trim() };
    }
  }
  return null;
}

function getEnvConfig() {
  const appIdEntry = resolveEnv(APP_ID_KEYS);
  const secretEntry = resolveEnv(SECRET_KEYS);

  if (!appIdEntry || !secretEntry) {
    throw new Error('未配置 H5 微信凭证，请在环境变量中设置 WECHAT_H5_APPID/WECHAT_H5_SECRET（或 REFERRAL_JS_APPID/REFERRAL_JS_SECRET）');
  }

  const { value: appId } = appIdEntry;
  const { value: secret } = secretEntry;

  if (appId.startsWith('REPLACE_ME_') || secret.startsWith('REPLACE_ME_')) {
    throw new Error('H5 微信凭证仍为占位符，请填写真实值');
  }

  return { appId, secret };
}

function getCurrentH5AppId() {
  const cfg = getEnvConfig();
  return cfg.appId;
}

async function getAccessToken() {
  const now = Date.now();
  if (cache.accessToken && cache.accessTokenExpiresAt - now > 60_000) {
    return cache.accessToken;
  }

  const { appId, secret } = getEnvConfig();
  const url = 'https://api.weixin.qq.com/cgi-bin/token';

  const resp = await axios.get(url, {
    params: {
      grant_type: 'client_credential',
      appid: appId,
      secret
    },
    timeout: 8000
  });

  if (resp.data.errcode) {
    throw new Error(`获取 access_token 失败 (${resp.data.errcode}): ${resp.data.errmsg}`);
  }

  cache.accessToken = resp.data.access_token;
  cache.accessTokenExpiresAt = now + (resp.data.expires_in * 1000);
  return cache.accessToken;
}

async function getJsApiTicket() {
  const now = Date.now();
  if (cache.jsapiTicket && cache.jsapiTicketExpiresAt - now > 60_000) {
    return cache.jsapiTicket;
  }

  const accessToken = await getAccessToken();
  const url = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket';

  let resp;
  try {
    resp = await axios.get(url, {
      params: {
        access_token: accessToken,
        type: 'jsapi'
      },
      timeout: 8000
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    throw new Error(`请求 jsapi_ticket 接口异常：${JSON.stringify(detail)}`);
  }

  const data = resp.data || {};
  if (typeof data.errcode !== 'undefined' && data.errcode !== 0) {
    throw new Error(`获取 jsapi_ticket 失败 (${data.errcode}): ${data.errmsg}`);
  }

  cache.jsapiTicket = data.ticket;
  cache.jsapiTicketExpiresAt = now + (data.expires_in * 1000);
  return cache.jsapiTicket;
}

function createNonceStr() {
  return crypto.randomBytes(8).toString('hex');
}

function createSignature({ ticket, nonceStr, timestamp, url }) {
  const plain = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  return crypto.createHash('sha1').update(plain).digest('hex');
}

async function buildJsSdkSignature(url) {
  const normalizedUrl = url.split('#')[0];
  const ticket = await getJsApiTicket();
  const nonceStr = createNonceStr();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createSignature({ ticket, nonceStr, timestamp, url: normalizedUrl });

  return {
    nonceStr,
    timestamp,
    signature,
    ticket
  };
}

module.exports = {
  buildJsSdkSignature,
  getCurrentH5AppId,
  getJsApiTicket,
  getAccessToken
};
