// CPF e CNPJ: limpeza, máscara e validação dos dígitos verificadores.
// O CNPJ aceita o formato alfanumérico (IN RFB 2.229/2024, em vigor desde
// julho de 2026): 12 caracteres de A-Z/0-9 seguidos de 2 dígitos numéricos.
// Usado no navegador e no servidor (src/documentos.js reexporta este arquivo).

/** Remove pontuação; mantém letras (CNPJ alfanumérico) em maiúsculas. */
export function limparDocumento(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

export function mascaraCPF(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function mascaraCNPJ(v) {
  const c = limparDocumento(v).slice(0, 14);
  let out = '';
  for (let i = 0; i < c.length; i++) {
    if (i === 2 || i === 5) out += '.';
    if (i === 8) out += '/';
    if (i === 12) out += '-';
    out += c[i];
  }
  return out;
}

export function validarCPF(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function validarCNPJ(v) {
  const c = limparDocumento(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  // Cada caractere vale (código ASCII − 48): "0".."9" = 0..9, "A" = 17 ... "Z" = 42.
  const valor = (ch) => ch.charCodeAt(0) - 48;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < n; i++) soma += valor(c[i]) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
