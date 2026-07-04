import { describe, it, expect } from 'vitest';
import { t, messages } from './i18n';

describe('i18n', () => {
  it('traduz chaves nos dois idiomas', () => {
    expect(t('pt', 'title')).toBe('Painel de Acompanhamento de Tickets');
    expect(t('en', 'title')).toBe('Ticket Tracking Dashboard');
  });

  it('pt e en têm exatamente as mesmas chaves', () => {
    expect(Object.keys(messages.pt).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it('chave desconhecida retorna a própria chave', () => {
    expect(t('pt', 'nao_existe')).toBe('nao_existe');
  });
});
