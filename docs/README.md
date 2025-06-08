# kSync Documentation

This directory contains comprehensive documentation for kSync, built with [Mintlify](https://mintlify.com/).

## 📁 Documentation Structure

```
docs/
├── mint.json                 # Mintlify configuration
├── introduction.mdx          # Main introduction page
├── quickstart.mdx           # 5-minute quickstart guide
├── installation.mdx         # Installation and setup
├── concepts/                # Core concepts
│   ├── architecture.mdx     # System architecture
│   ├── events.mdx          # Events and schemas
│   ├── storage.mdx         # Storage options
│   ├── sync.mdx            # Real-time synchronization
│   ├── materializers.mdx   # State materialization
│   ├── streaming.mdx       # AI streaming support
│   └── presence.mdx        # Presence tracking
├── guides/                 # Step-by-step guides
│   ├── basic-usage.mdx     # Fundamentals
│   ├── real-time-sync.mdx  # Multi-client sync
│   ├── ai-streaming.mdx    # AI applications
│   ├── multiplayer-games.mdx # Game development
│   ├── offline-first.mdx   # Offline capabilities
│   └── performance.mdx     # Optimization
├── api-reference/          # Complete API docs
│   ├── introduction.mdx    # API overview
│   ├── ksync-class.mdx     # Main KSync class
│   ├── storage.mdx         # Storage interfaces
│   ├── sync-client.mdx     # Sync client API
│   └── types.mdx           # TypeScript types
├── examples/               # Real-world examples
│   ├── introduction.mdx    # Examples overview
│   ├── chat-app.mdx        # Chat application
│   ├── todo-sync.mdx       # Todo synchronization
│   ├── ai-streaming.mdx    # AI streaming chat
│   └── multiplayer-game.mdx # Multiplayer game
└── advanced/               # Advanced topics
    ├── custom-storage.mdx  # Custom storage backends
    ├── custom-sync.mdx     # Custom sync protocols
    ├── error-handling.mdx  # Error management
    ├── testing.mdx         # Testing strategies
    └── deployment.mdx      # Production deployment
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Mintlify CLI

### Local Development

1. **Install Mintlify CLI**:
   ```bash
   npm i -g mintlify
   ```

2. **Start development server**:
   ```bash
   cd docs
   mintlify dev
   ```

3. **Open in browser**:
   ```
   http://localhost:3000
   ```

### Building for Production

```bash
mintlify build
```

## 📝 Writing Documentation

### File Format

All documentation files use MDX format (`.mdx`), which allows:
- Markdown syntax
- React components
- Interactive elements
- Code syntax highlighting

### Frontmatter

Each file starts with YAML frontmatter:

```yaml
---
title: 'Page Title'
description: 'Brief description for SEO and navigation'
---
```

### Mintlify Components

Use Mintlify's built-in components for rich documentation:

#### Cards

```mdx
<CardGroup cols={2}>
  <Card title="Feature 1" icon="star" href="/link">
    Description of feature 1
  </Card>
  <Card title="Feature 2" icon="rocket" href="/link">
    Description of feature 2
  </Card>
</CardGroup>
```

#### Code Groups

```mdx
<CodeGroup>
```typescript TypeScript
const example = 'TypeScript code';
```

```javascript JavaScript
const example = 'JavaScript code';
```
</CodeGroup>
```

#### Tabs

```mdx
<Tabs>
  <Tab title="Option 1">
    Content for option 1
  </Tab>
  <Tab title="Option 2">
    Content for option 2
  </Tab>
</Tabs>
```

#### Accordions

```mdx
<AccordionGroup>
  <Accordion title="Question 1" icon="question">
    Answer to question 1
  </Accordion>
  <Accordion title="Question 2" icon="question">
    Answer to question 2
  </Accordion>
</AccordionGroup>
```

#### Callouts

```mdx
<Note>
  This is a note callout
</Note>

<Warning>
  This is a warning callout
</Warning>

<Tip>
  This is a tip callout
</Tip>
```

### Code Examples

Always include complete, runnable code examples:

```typescript
import { z } from 'zod';
import { createKSync } from '@klastra/ksync';

// Complete example that users can copy and run
const ksync = createKSync();

ksync.defineSchema('message', z.object({
  content: z.string(),
  author: z.string(),
}));

await ksync.send('message', {
  content: 'Hello, world!',
  author: 'Alice',
});
```

## 🎯 Content Guidelines

### Writing Style

- **Clear and concise**: Use simple language
- **Action-oriented**: Start with verbs (Create, Configure, Build)
- **User-focused**: Address the reader directly ("you")
- **Progressive**: Build complexity gradually

### Code Standards

- **Complete examples**: Always include imports and setup
- **Type safety**: Show TypeScript usage
- **Error handling**: Include error handling patterns
- **Comments**: Explain non-obvious code

### Structure

1. **Overview**: Brief introduction
2. **Prerequisites**: What users need first
3. **Step-by-step**: Numbered instructions
4. **Examples**: Complete working code
5. **Best practices**: Do's and don'ts
6. **Next steps**: Links to related content

## 🔗 Navigation

The navigation structure is defined in `mint.json`:

```json
{
  "navigation": [
    {
      "group": "Get Started",
      "pages": ["introduction", "quickstart", "installation"]
    },
    {
      "group": "Core Concepts", 
      "pages": ["concepts/architecture", "concepts/events"]
    }
  ]
}
```

## 🎨 Customization

### Branding

Update branding in `mint.json`:

```json
{
  "name": "kSync",
  "logo": {
    "dark": "/logo/dark.svg",
    "light": "/logo/light.svg"
  },
  "colors": {
    "primary": "#0D9373",
    "light": "#07C983",
    "dark": "#0D9373"
  }
}
```

### Analytics

Add analytics tracking:

```json
{
  "analytics": {
    "gtag": {
      "measurementId": "G-XXXXXXXXXX"
    }
  }
}
```

## 📊 SEO Optimization

- **Descriptive titles**: Clear, searchable page titles
- **Meta descriptions**: Compelling descriptions for each page
- **Structured content**: Use headings hierarchically
- **Internal linking**: Link between related pages
- **Keywords**: Include relevant technical terms

## 🚀 Deployment

### Mintlify Hosting

1. Connect your GitHub repository to Mintlify
2. Configure custom domain (optional)
3. Deploy automatically on push to main

### Custom Hosting

1. Build static files: `mintlify build`
2. Deploy `_site` directory to your hosting provider
3. Configure redirects and custom domain

## 🤝 Contributing

### Adding New Pages

1. Create new `.mdx` file in appropriate directory
2. Add frontmatter with title and description
3. Update navigation in `mint.json`
4. Test locally with `mintlify dev`

### Updating Content

1. Edit existing `.mdx` files
2. Follow established patterns and style
3. Test changes locally
4. Submit pull request

### Review Process

- Technical accuracy review
- Writing style review
- Code example testing
- Link validation

## 📚 Resources

- [Mintlify Documentation](https://mintlify.com/docs)
- [MDX Documentation](https://mdxjs.com/)
- [kSync GitHub Repository](https://github.com/klastra-ai/ksync)
- [kSync Examples](../examples/)

## 📞 Support

For documentation questions or suggestions:
- Open an issue on GitHub
- Email: docs@klastra.ai
- Discord: [Join our community](https://klastra.ai/discord) 