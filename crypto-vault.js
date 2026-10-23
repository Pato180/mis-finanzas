'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MisFinanzasCrypto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FORMAT = 'mis-finanzas-encrypted-backup';
  const VERSION = 1;
  const ITERATIONS = 310000;
  const AAD = new TextEncoder().encode('Mis Finanzas encrypted backup v1');
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  function cryptoApi() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto;
    if (typeof require === 'function') {
      try { return require('node:crypto').webcrypto; } catch (error) {}
    }
    throw new Error('Este dispositivo no dispone de Web Crypto. Actualiza el navegador para cifrar el respaldo.');
  }
  function toBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function fromBase64(value, expectedLength) {
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      throw new Error('El respaldo cifrado está dañado o tiene un formato inválido.');
    }
    let bytes;
    try {
      bytes = typeof Buffer !== 'undefined'
        ? new Uint8Array(Buffer.from(value, 'base64'))
        : Uint8Array.from(atob(value), char => char.charCodeAt(0));
    } catch (error) {
      throw new Error('El respaldo cifrado está dañado o tiene un formato inválido.');
    }
    if (expectedLength && bytes.length !== expectedLength) throw new Error('El respaldo cifrado está dañado o tiene un formato inválido.');
    return bytes;
  }
  function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 10) {
      throw new Error('La contraseña del respaldo debe tener al menos 10 caracteres.');
    }
  }
  async function deriveKey(password, salt, usages) {
    const webcrypto = cryptoApi();
    const material = await webcrypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return webcrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      usages
    );
  }
  async function encryptBackup(plaintext, password) {
    validatePassword(password);
    if (typeof plaintext !== 'string') throw new TypeError('El contenido del respaldo debe ser texto.');
    const webcrypto = cryptoApi();
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, ['encrypt']);
    const ciphertext = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 },
      key,
      encoder.encode(plaintext)
    );
    return {
      format: FORMAT,
      version: VERSION,
      cipher: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: ITERATIONS,
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext))
    };
  }
  async function decryptBackup(envelope, password) {
    validatePassword(password);
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
        envelope.format !== FORMAT || envelope.version !== VERSION ||
        envelope.cipher !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-SHA-256' ||
        envelope.iterations !== ITERATIONS) {
      throw new Error('El archivo no es un respaldo cifrado compatible de Mis Finanzas.');
    }
    const salt = fromBase64(envelope.salt, 16);
    const iv = fromBase64(envelope.iv, 12);
    const ciphertext = fromBase64(envelope.ciphertext);
    if (ciphertext.length < 16) throw new Error('El respaldo cifrado está incompleto o dañado.');
    try {
      const webcrypto = cryptoApi();
      const key = await deriveKey(password, salt, ['decrypt']);
      const plaintext = await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 },
        key,
        ciphertext
      );
      return decoder.decode(plaintext);
    } catch (error) {
      if (error instanceof TypeError) throw error;
      throw new Error('No se pudo descifrar el respaldo. Comprueba la contraseña o que el archivo no esté dañado.');
    }
  }
  return Object.freeze({ encryptBackup, decryptBackup, format: FORMAT, version: VERSION, iterations: ITERATIONS });
});
