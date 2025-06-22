# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2025-01-27

### 🎯 Major Parsing Improvements

#### Added
- **Enhanced column detection**: Better left/right column separation prevents content mixing
- **Major city location detection**: Added support for 100+ major cities worldwide (Bangalore, Mumbai, Delhi, Chennai, etc.)
- **Cross-page content parsing**: Properly handles content that spans multiple PDF pages
- **Automatic text capitalization**: First letter of each highlight properly capitalized
- **Company URL detection**: Automatically detects and includes company websites

#### Fixed
- **Truncated highlights**: Removed arbitrary 40-line scanning limits - work section now properly extends until Education section
- **Healthcare content recognition**: Medical terminology (Critical care, ambulatory care, etc.) no longer incorrectly filtered out
- **Content filtering**: Removed overly aggressive publication filtering that incorrectly excluded legitimate job descriptions
- **Location parsing**: "Bangalore" and other major cities now correctly detected as locations instead of highlights

#### Improved
- **Data structure quality**: Workshop titles, data types, and technical content now properly separated into individual highlights instead of massive single lines
- **Parsing accuracy**: Significantly reduced false positives in content filtering
- **Test coverage**: All test fixtures now pass with improved parsing accuracy

### Technical Details
- Enhanced `isLocation()` function with major city recognition
- Removed arbitrary line limits in work section parsing
- Improved bullet point detection to prevent incorrect text truncation
- Better handling of gray text and smaller fonts for location detection
- Minimal content filtering approach leveraging column separation

## [0.2.0] - 2024-12-XX

### Added
- ESLint v9 + Prettier flat config
- Husky + lint-staged pre-commit hooks
- TypeDoc documentation generation
- GitHub Actions CI pipeline
- MIT license

## [0.1.0] - 2024-12-XX

### Added
- Initial TypeScript library and CLI
- Basic parsing of Experience and Education sections
- JSON Resume schema compliance
- Jest test suite with fixtures
- ESM build configuration 