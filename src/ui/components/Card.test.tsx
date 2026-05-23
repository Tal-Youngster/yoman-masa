import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders title, description, children, and footer', () => {
    render(
      <Card title="Header" description="Sub" footer={<span>foot</span>}>
        <p>body</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Header' })).toBeInTheDocument();
    expect(screen.getByText('Sub')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByText('foot')).toBeInTheDocument();
  });

  it('omits header when no title or description', () => {
    render(<Card>plain</Card>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('plain')).toBeInTheDocument();
  });
});
