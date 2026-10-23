const c=require('crypto');
const j=c.generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'});
console.log('BPBlcTXDkLCZXp_6lZrENAtDqZDnaTs0x-ox78a1r2qs-hjGLfzg1irm-TcmZqBTnsdqR9I-hiv7ovkb1JLF6zg',Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url'));
console.log('{"kty":"EC","x":"8GVxNcOQsJlen_qVmsQ0C0OpkOdpOzTH6jHvxrWvaqw","y":"-hjGLfzg1irm-TcmZqBTnsdqR9I-hiv7ovkb1JLF6zg","crv":"P-256","d":"klFYkm5f0WNYgR5EbucL-vTAZlVibxtanQQeG2KFRc8"}',JSON.stringify(j));