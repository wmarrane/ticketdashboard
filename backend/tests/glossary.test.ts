import { describe, it, expect } from 'vitest';
import { translateTitle } from '../src/pipeline/glossary';

describe('translateTitle (glossário PT→EN)', () => {
  it('traduz termo simples preservando o restante do texto', () => {
    expect(translateTitle('erro no webhook')).toBe('error no webhook');
  });

  it('é case-insensitive e preserva inicial maiúscula', () => {
    expect(translateTitle('Erro de processamento')).toBe('Error de processing');
  });

  it('termos multi-palavra têm precedência (longest-first)', () => {
    // 'nota fiscal' → 'tax invoice' (e não 'nota' + tradução parcial)
    expect(translateTitle('cancelamento de nota fiscal')).toBe('cancellation de tax invoice');
    expect(translateTitle('Contas a pagar em atraso')).toBe('Accounts payable em atraso');
    expect(translateTitle('contas a receber duplicadas')).toBe('accounts receivable duplicadas');
  });

  it('substitui apenas palavras inteiras', () => {
    // 'erros' tem entrada própria; 'errolândia' não deve casar com 'erro'
    expect(translateTitle('errolândia')).toBe('errolândia');
  });

  it('traduz termos acentuados (integração, relatório, homologação)', () => {
    expect(translateTitle('falha na integração')).toBe('failure na integration');
    expect(translateTitle('relatório de estoque')).toBe('report de inventory');
    expect(translateTitle('homologação pendente')).toBe('UAT pendente');
  });

  it('traduz múltiplos termos na mesma frase', () => {
    expect(translateTitle('erro de pagamento na fatura do cliente'))
      .toBe('error de payment na invoice do customer');
  });

  it('texto sem termos do glossário permanece intacto', () => {
    expect(translateTitle('Webhook XPTO 123')).toBe('Webhook XPTO 123');
  });

  it('string vazia retorna vazia', () => {
    expect(translateTitle('')).toBe('');
  });
});
