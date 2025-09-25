# Import Guide Media

This folder contains screenshots and videos for the import wizard instructions.

## File Naming Convention

Use this pattern: `[device]-[source]-[description].jpg` or `.mp4`

### Examples:
- `iphone-email-step1.jpg` - iPhone email import, step 1
- `ipad-website-login.jpg` - iPad website import, login screen
- `mac-pdf-select.mp4` - Mac PDF selection video
- `efk-tablet-copy.jpg` - EFK tablet copy operation

### Device Prefixes:
- `iphone-` - iPhone screenshots
- `ipad-` - iPad screenshots
- `mac-` - Mac screenshots
- `efk-tablet-` - EFK tablet screenshots
- `efk-laptop-` - EFK laptop screenshots

### Source Types:
- `email-` - Email-based import
- `website-` - Company website import
- `pdf-` - PDF document import
- `manual-` - Manual entry import

### Description Guidelines:
- `step1`, `step2`, etc. - Sequential steps
- `login` - Login/authentication screens
- `select` - Text selection operations
- `copy` - Copy operations
- `paste` - Paste operations
- `import` - Final import screens

## Adding New Media

1. Take screenshot or record video
2. Name using the convention above
3. Drop file in this folder
4. Update the corresponding entry in `import-workflow.json`
5. Push to GitHub

## File Types
- **Images**: Use `.jpg` or `.png`
- **Videos**: Use `.mp4` for best compatibility

## Placeholder Files

Until you add real screenshots, the wizard will show broken image icons. This is normal and expected during development.

## Tips for Good Screenshots

1. **Clean UI**: Hide personal information, close unnecessary apps
2. **Consistent Size**: Try to keep screenshots similar dimensions
3. **Good Contrast**: Ensure text is readable
4. **Focus Areas**: Highlight the relevant UI elements if possible
5. **File Size**: Optimize images for web (under 500KB ideally)

For videos:
1. **Short Duration**: Keep videos under 30 seconds
2. **Clear Actions**: Show the exact steps slowly and clearly
3. **No Audio**: Videos should demonstrate visually
4. **File Size**: Compress for web delivery