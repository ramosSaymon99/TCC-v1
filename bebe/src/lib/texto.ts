/** "1 registro" / "3 registros": plural correto em vez de "registro(s)". */
export const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
