# Contributing to Informed News

Thank you for your interest in contributing to Informed News! This document provides guidelines and instructions for contributing to the project.

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Build the project: `npm run build`
5. Run type checking: `npm run typecheck`
6. Run linting: `npm run lint`

## Commit Message Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for our commit messages. This ensures consistent commit history and enables automated versioning and changelog generation.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: A new feature (triggers MINOR version bump)
- `fix`: A bug fix (triggers PATCH version bump)
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Other changes (dependencies, etc.)
- `revert`: Reverts a previous commit

### Scopes

- `auth`: Authentication-related changes
- `articles`: Article management and display
- `sources`: News source management
- `filters`: Article filtering functionality
- `ui`: UI components and styling
- `context`: State management and context
- `utils`: Utility functions
- `types`: TypeScript type definitions
- `config`: Configuration files

### Examples

```
feat(articles): add favorite article functionality

Users can now mark articles as favorites and filter by favorites.

fix(auth): resolve session restoration on page reload

Fixes #42

refactor(context): simplify article filtering logic
```

### Using the Commit Template

We use a git commit template to help you write proper commit messages. When you run `git commit` without a message, vim will open with the template showing all available types, scopes, and examples.

## Code Standards

### TypeScript
- Use strict TypeScript configuration
- Define interfaces for all data structures
- Type all function parameters and return values
- Avoid using `any` type

### React Components
- Use functional components with hooks
- Use PascalCase for component names
- Define prop interfaces explicitly
- Use the `useApp()` hook to access state
- Dispatch actions to modify state (never mutate directly)

### Styling
- Use Tailwind CSS utility classes
- No inline styles
- Follow the dark theme (stone-950 background)
- Ensure responsive design

### State Management
- All state changes go through the reducer
- Add new state properties to `AppState` interface
- Add corresponding action types to `AppAction` union
- Implement action handlers in `appReducer.ts`

## Release Process

We use [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and releases. The release process is triggered automatically when commits are pushed to the `main` branch.

### Version Bumping
- `feat`: Minor version bump (1.0.0 → 1.1.0)
- `fix`: Patch version bump (1.0.0 → 1.0.1)
- `BREAKING CHANGE`: Major version bump (1.0.0 → 2.0.0)

### Release Workflow
1. Commits are pushed to `main` branch
2. GitHub Actions workflow runs
3. Semantic-release analyzes commits
4. Version is bumped according to commit types
5. CHANGELOG.md is updated
6. GitHub release is created
7. Release notes are generated from commits

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the code standards
3. Write clear commit messages using conventional commits
4. Ensure all tests pass
5. Run type checking and linting
6. Create a pull request with a clear description
7. Reference any related issues

## Questions?

If you have questions about contributing, please open an issue or contact the maintainers.

