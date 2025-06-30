#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Import our parser and validator
const { parseLinkedInPdf } = await import('../dist/index.js');
const { validateJSONResume } = await import('../src/validate.mjs');

/**
 * Create fixture directories and expected JSON files from Profile.pdf files
 * Usage: node scripts/create-fixtures.mjs
 * 
 * This script will:
 * 1. Scan tests/ directory for Profile.pdf files
 * 2. Create fixture directory structure: tests/fixtures/{name}/data/
 * 3. Move PDF to proper location
 * 4. Generate Profile.expected.json
 * 5. Validate output against JSON Resume schema
 */

function sanitizeName(name) {
  // Convert name to a safe fixture name
  return name
    .replace(/[^a-zA-Z0-9-_\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'profile';
}

function generateFixtureName(profileName, existingNames = new Set()) {
  if (!profileName) return 'profile';
  
  const nameParts = profileName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];
  
  // Start with just first name
  let baseName = sanitizeName(firstName);
  let fixtureName = baseName;
  
  // If not unique, add last initial
  if (existingNames.has(fixtureName) && lastName && lastName !== firstName) {
    const lastInitial = lastName.charAt(0).toLowerCase();
    fixtureName = `${baseName}-${lastInitial}`;
  }
  
  // If still not unique, add numerical suffix
  let counter = 2;
  let finalName = fixtureName;
  while (existingNames.has(finalName)) {
    finalName = `${fixtureName}-${counter}`;
    counter++;
  }
  
  return finalName;
}

function extractNameFromPath(pdfPath) {
  // Fallback: Try to extract a reasonable name from the PDF filename or path
  const basename = path.basename(pdfPath, '.pdf');
  
  // If it's just "Profile", try to get name from parent directory
  if (basename.toLowerCase() === 'profile') {
    const parentDir = path.basename(path.dirname(pdfPath));
    if (parentDir !== 'tests' && parentDir !== '.') {
      return sanitizeName(parentDir);
    }
  }
  
  return sanitizeName(basename);
}

async function createFixture(pdfPath, fixtureName, parsedResult) {
  console.log(`\n📁 Creating fixture: ${fixtureName}`);
  
  const fixtureDir = path.join(projectRoot, 'tests', 'fixtures', fixtureName);
  const dataDir = path.join(fixtureDir, 'data');
  
  // Create directories
  fs.mkdirSync(dataDir, { recursive: true });
  
  const targetPdfPath = path.join(dataDir, 'Profile.pdf');
  const expectedJsonPath = path.join(dataDir, 'Profile.expected.json');
  
  try {
    // Move PDF to fixture location
    if (path.resolve(pdfPath) !== path.resolve(targetPdfPath)) {
      fs.renameSync(pdfPath, targetPdfPath);
      console.log(`   ✅ PDF moved to ${path.relative(projectRoot, targetPdfPath)}`);
    }
    
    // Use the already parsed result
    const result = parsedResult;
    
    // Validate against schema
    console.log('   🔍 Validating against JSON Resume schema...');
    const validation = validateJSONResume(result);
    
    if (!validation.valid) {
      console.log('   ⚠️  Schema validation warnings:');
      validation.errors?.forEach(error => {
        console.log(`      - ${error}`);
      });
    } else {
      console.log('   ✅ Schema validation passed');
    }
    
    // Write expected JSON
    fs.writeFileSync(expectedJsonPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`   ✅ Expected JSON written to ${path.relative(projectRoot, expectedJsonPath)}`);
    
    // Show summary
    console.log('   📊 Extracted data:');
    console.log(`      - Name: ${result.basics?.name || 'N/A'}`);
    console.log(`      - Work: ${result.work.length} positions`);
    console.log(`      - Education: ${result.education.length} entries`);
    console.log(`      - Skills: ${result.skills?.length || 0} skills`);
    console.log(`      - Certificates: ${result.certificates?.length || 0} certificates`);
    console.log(`      - Languages: ${result.languages?.length || 0} languages`);
    
    return { success: true, fixtureName, validation };
    
  } catch (error) {
    console.log(`   ❌ Error processing ${fixtureName}: ${error.message}`);
    return { success: false, fixtureName, error: error.message };
  }
}

async function main() {
  console.log('🚀 LinkedIn Profile Fixture Generator');
  console.log('=====================================\n');
  
  const testsDir = path.join(projectRoot, 'tests');
  
  // Find PDF files ONLY directly under tests/ directory (not in subdirectories)
  const pdfFiles = [];
  const items = fs.readdirSync(testsDir);
  
  for (const item of items) {
    if (item.toLowerCase().endsWith('.pdf')) {
      const fullPath = path.join(testsDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        pdfFiles.push(fullPath);
      }
    }
  }
  
  if (pdfFiles.length === 0) {
    console.log('📂 No PDF files found directly in tests/ directory');
    console.log('\n💡 To use this script:');
    console.log('   1. Place PDF files directly in tests/ directory (tests/SomeProfile.pdf)');
    console.log('   2. Run: node scripts/create-fixtures.mjs');
    console.log('   3. Files will be moved to proper fixture locations');
    console.log('\n⚠️  Note: Only processes files directly in tests/, not subdirectories');
    return;
  }
  
  console.log(`📋 Found ${pdfFiles.length} PDF file(s):`);
  pdfFiles.forEach(pdf => {
    console.log(`   - ${path.relative(projectRoot, pdf)}`);
  });
  
  console.log('\n🔄 Pre-parsing PDFs to extract names...');
  
  // First pass: Parse all PDFs to extract profile names
  const pdfData = [];
  for (const pdfPath of pdfFiles) {
    try {
      console.log(`   📄 Parsing ${path.relative(projectRoot, pdfPath)}...`);
      const result = await parseLinkedInPdf(pdfPath);
      const profileName = result.basics?.name;
      
      pdfData.push({
        pdfPath,
        result,
        profileName,
        fallbackName: extractNameFromPath(pdfPath)
      });
      
      console.log(`      → Profile: ${profileName || 'Unknown'}`);
    } catch (error) {
      console.log(`      ❌ Failed to parse: ${error.message}`);
      pdfData.push({
        pdfPath,
        result: null,
        profileName: null,
        fallbackName: extractNameFromPath(pdfPath),
        error: error.message
      });
    }
  }
  
  // Get existing fixture names to avoid conflicts
  const fixturesDir = path.join(projectRoot, 'tests', 'fixtures');
  const existingFixtures = new Set();
  if (fs.existsSync(fixturesDir)) {
    fs.readdirSync(fixturesDir)
      .filter(f => fs.statSync(path.join(fixturesDir, f)).isDirectory())
      .forEach(name => existingFixtures.add(name));
  }
  
  // Generate unique fixture names based on profile names
  console.log('\n🏷️  Generating fixture names...');
  const usedNames = new Set(existingFixtures);
  
  for (const data of pdfData) {
    if (data.result) {
      data.fixtureName = generateFixtureName(data.profileName, usedNames);
      usedNames.add(data.fixtureName);
      console.log(`   ${data.profileName || 'Unknown'} → ${data.fixtureName}`);
    } else {
      data.fixtureName = data.fallbackName;
      // Ensure fallback name is unique too
      let counter = 2;
      let finalName = data.fixtureName;
      while (usedNames.has(finalName)) {
        finalName = `${data.fixtureName}-${counter}`;
        counter++;
      }
      data.fixtureName = finalName;
      usedNames.add(data.fixtureName);
      console.log(`   Failed PDF → ${data.fixtureName} (fallback)`);
    }
  }
  
  // Second pass: Create fixtures with proper names
  const results = [];
  
  for (const data of pdfData) {
    // Check if fixture already exists
    const fixtureDir = path.join(projectRoot, 'tests', 'fixtures', data.fixtureName);
    if (fs.existsSync(fixtureDir)) {
      console.log(`\n⏭️  Skipping ${data.fixtureName} (fixture already exists)`);
      continue;
    }
    
    if (data.result) {
      const result = await createFixture(data.pdfPath, data.fixtureName, data.result);
      results.push(result);
    } else {
      console.log(`\n❌ Skipping ${data.fixtureName} (failed to parse): ${data.error}`);
      results.push({ 
        success: false, 
        fixtureName: data.fixtureName, 
        error: data.error 
      });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successfully created: ${successful.length} fixtures`);
  if (successful.length > 0) {
    successful.forEach(r => {
      const status = r.validation?.valid ? '✅' : '⚠️ ';
      console.log(`   ${status} ${r.fixtureName}`);
    });
  }
  
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length} fixtures`);
    failed.forEach(r => {
      console.log(`   ❌ ${r.fixtureName}: ${r.error}`);
    });
  }
  
  if (successful.length > 0) {
    console.log('\n🧪 Next steps:');
    console.log('   - Run: npm test');
    console.log('   - Review generated expected JSON files');
    console.log('   - Adjust parsing logic if needed');
  }
}

main().catch(console.error); 