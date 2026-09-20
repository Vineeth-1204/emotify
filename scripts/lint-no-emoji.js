const fs = require('fs');
const path = require('path');

// Unicode ranges covering standard emojis and pictographs
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}\u{2B50}-\u{2B55}\u{1F900}-\u{1F9FF}]/u;

// Target folders to scan
const SCAN_DIRS = ['app', 'components', 'constants', 'context', 'utils'];

// Student-facing server files in convex/
const CONVEX_STUDENT_FILES = ['convex/alerts.ts', 'convex/companion.ts'];

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

let totalMatches = 0;
const findings = [];

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Ignore test files or comments that reference emoji unicode specs
      if (filePath.includes('.test.') || filePath.includes('lint-no-emoji')) return;

      const match = line.match(EMOJI_REGEX);
      if (match) {
        totalMatches++;
        findings.push({
          file: filePath,
          line: idx + 1,
          char: match[0],
          preview: line.trim()
        });
      }
    });
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
}

function scanDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      scanDir(fullPath);
    } else if (entry.isFile() && EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      scanFile(fullPath);
    }
  }
}

console.log('--- EMOTIFY Zero-Emoji Bundle Audit ---');
SCAN_DIRS.forEach(dir => scanDir(path.resolve(dir)));
CONVEX_STUDENT_FILES.forEach(file => {
  const p = path.resolve(file);
  if (fs.existsSync(p)) scanFile(p);
});

if (findings.length > 0) {
  console.log(`❌ FAILED: Found ${findings.length} Unicode emoji occurrence(s) in student-facing files:`);
  findings.slice(0, 30).forEach(f => {
    console.log(`  ${f.file}:${f.line} [${f.char}] -> ${f.preview.substring(0, 70)}`);
  });
  if (findings.length > 30) {
    console.log(`  ... and ${findings.length - 30} more occurrences.`);
  }
  process.exit(1);
} else {
  console.log('✅ PASSED: Zero Unicode emojis found in student-facing bundle!');
  process.exit(0);
}
