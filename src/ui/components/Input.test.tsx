import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  it('associates label with input', () => {
    render(<Input label="Trip name" placeholder="Kyoto" />);
    const input = screen.getByLabelText('Trip name');
    expect(input).toHaveAttribute('placeholder', 'Kyoto');
  });

  it('shows error and marks aria-invalid', () => {
    render(<Input label="Slug" error="Required" />);
    const input = screen.getByLabelText('Slug');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('shows hint when no error', () => {
    render(<Input label="Currency" hint="3-letter code" />);
    expect(screen.getByText('3-letter code')).toBeInTheDocument();
    expect(screen.getByLabelText('Currency')).not.toHaveAttribute('aria-invalid');
  });

  it('accepts user input', async () => {
    render(<Input label="Name" />);
    const input = screen.getByLabelText('Name');
    await userEvent.type(input, 'Tokyo');
    expect(input).toHaveValue('Tokyo');
  });
});
