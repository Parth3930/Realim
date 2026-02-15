# Contributing to Realim

First off, thank you for considering contributing to Realim! 🎉

It's people like you that make Realim such a great tool. We welcome contributions from everyone, whether it's a bug report, feature suggestion, documentation improvement, or code contribution.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Code Contributions](#code-contributions)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our commitment to providing a welcoming and inspiring community for all. Please be respectful, considerate, and constructive in your interactions.

### Our Standards

- **Be Respectful**: Treat everyone with respect and kindness
- **Be Constructive**: Provide helpful feedback and suggestions
- **Be Patient**: Remember that contributors have different skill levels
- **Be Inclusive**: Welcome newcomers and help them get started

## 🤝 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](../../issues) to avoid duplicates.

When you create a bug report, please include as many details as possible:

**Bug Report Template:**

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
- OS: [e.g. Windows 11, macOS 14]
- Browser: [e.g. Chrome 120, Firefox 121]
- Device: [e.g. Desktop, iPhone 12]

**Additional context**
Add any other context about the problem here.
```

### Suggesting Features

We love to hear your ideas! Feature requests are tracked as GitHub issues.

**Feature Request Template:**

```markdown
**Is your feature request related to a problem?**
A clear description of what the problem is.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Any alternative solutions or features you've considered.

**Additional context**
Add any other context, mockups, or screenshots about the feature request.
```

### Code Contributions

We actively welcome your pull requests!

1. Fork the repo and create your branch from `main`
2. Follow the [Development Setup](#development-setup) guide
3. Make your changes following our [Coding Standards](#coding-standards)
4. Test your changes thoroughly
5. Update documentation if needed
6. Submit a pull request!

## 🛠️ Development Setup

### Prerequisites

- **Bun**: [Install Bun](https://bun.sh)
- **Git**: [Install Git](https://git-scm.com/)
- **Code Editor**: We recommend [VS Code](https://code.visualstudio.com/)

### Getting Started

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/realim.git
   cd realim
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Start Development Server**
   ```bash
   bun dev
   ```
   Open http://localhost:4321 in your browser

4. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

### Project Structure Overview

```
realim/
├── src/
│   ├── components/     # React components
│   │   ├── board/      # Board-specific components
│   │   └── ui/         # Reusable UI components
│   ├── lib/            # Core logic & utilities
│   │   ├── store.ts    # Zustand state management
│   │   ├── p2p.ts      # P2P networking
│   │   └── utils.ts    # Helper functions
│   ├── pages/          # Astro pages (routes)
│   └── styles/         # Global styles
├── public/             # Static assets
└── astro.config.mjs    # Astro configuration
```

## 📏 Coding Standards

### TypeScript

- **Always use TypeScript** - No `.js` or `.jsx` files
- **Explicit types** for function parameters and return values
- **No `any`** - Use `unknown` or proper types instead
- **Use interfaces** for object shapes

```typescript
// ✅ Good
interface User {
  id: string;
  name: string;
  email?: string;
}

function getUser(id: string): User | null {
  // ...
}

// ❌ Bad
function getUser(id: any): any {
  // ...
}
```

### React Components

- **Functional components** with hooks
- **Named exports** for components
- **Props interface** defined above component
- **Proper component naming** (PascalCase)

```typescript
// ✅ Good
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button onClick={onClick} className={cn('btn', `btn-${variant}`)}>
      {label}
    </button>
  );
}
```

### Styling

- **Use Tailwind CSS** utility classes
- **Use `cn()` helper** from `lib/utils.ts` for conditional classes
- **Avoid inline styles** unless absolutely necessary
- **Follow existing design patterns** (glassmorphism, dark mode)

```typescript
// ✅ Good
<div className={cn(
  'p-4 rounded-lg',
  isActive && 'bg-primary text-white',
  'hover:scale-105 transition-transform'
)}>

// ❌ Bad
<div style={{ padding: '16px', borderRadius: '8px' }}>
```

### State Management

- **Use Zustand** for global state
- **Use React hooks** for local component state
- **Keep state minimal** - derive values when possible

### Code Organization

- **Single Responsibility** - One component does one thing
- **DRY Principle** - Don't repeat yourself
- **Meaningful names** - Self-documenting code
- **Small functions** - Max 50 lines when possible
- **Comments** - Explain "why", not "what"

## 📝 Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(board): add image upload support

fix(p2p): resolve connection timeout issue

docs(readme): update installation instructions

refactor(store): simplify element management logic

style(ui): improve button hover animations
```

### Best Practices

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor" not "moves cursor")
- First line should be 50 characters or less
- Reference issues and PRs when relevant

## 🔄 Pull Request Process

### Before Submitting

- [ ] Code follows the style guidelines
- [ ] Self-review of your own code
- [ ] Comments added in complex areas
- [ ] No new warnings or errors
- [ ] Changes work locally
- [ ] Documentation updated (if needed)

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## How Has This Been Tested?
Describe the tests you ran and your testing environment.

## Screenshots (if applicable)
Add screenshots to help explain your changes.

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code in complex areas
- [ ] My changes generate no new warnings
- [ ] I have tested this locally
```

### Review Process

1. A maintainer will review your PR within a few days
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release! 🎉

## 🚀 Areas to Contribute

Looking for ideas? Here are some areas that could use help:

### High Priority
- [ ] Mobile gesture controls optimization
- [ ] Voice chat integration
- [ ] Screen sharing capabilities
- [ ] Drawing tools improvements
- [ ] Performance optimizations

### Medium Priority
- [ ] More element types (shapes, diagrams)
- [ ] Export/import room data
- [ ] Custom themes
- [ ] Keyboard shortcuts customization
- [ ] Better error handling

### Good First Issues
- [ ] Documentation improvements
- [ ] UI/UX enhancements
- [ ] Code comments and cleanup
- [ ] Test coverage
- [ ] Accessibility improvements

## 💡 Tips for Success

1. **Start Small**: Begin with documentation or small bug fixes
2. **Ask Questions**: Don't hesitate to ask for help in issues
3. **Stay Updated**: Pull the latest changes before starting work
4. **Test Thoroughly**: Test in multiple browsers and devices
5. **Be Patient**: Reviews may take time - we appreciate your patience!

## 🎓 Learning Resources

- [Astro Docs](https://docs.astro.build)
- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [WebRTC Guide](https://webrtc.org/getting-started/overview)
- [Trystero Documentation](https://github.com/dmotz/trystero)

## 📬 Questions?

If you have questions that aren't covered in this guide:

- Open a [GitHub Discussion](../../discussions)
- Comment on a relevant issue
- Reach out through the project's contact methods

---

Thank you for contributing to Realim! Your efforts help make this project better for everyone. 🙌

**Happy Coding!** 💻✨