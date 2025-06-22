import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validate a JSONResume object against the JSON Resume schema.
 * 
 * @param {object} resume - The resume object to validate
 * @param {string} [schemaPath] - Optional path to schema file
 * @returns {object} Validation result with errors if invalid
 */
export function validateJSONResume(resume, schemaPath) {
  try {
    const schemaFilePath = schemaPath || join(__dirname, '..', 'schemas', 'jsonresume.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf8'));
    
    const ajv = new Ajv({ 
      allErrors: true, 
      strict: false,  // Allow older schema formats
      validateFormats: false  // Skip format validation for better compatibility
    });
    addFormats(ajv);
    
    const validate = ajv.compile(schema);
    const valid = validate(resume);
    
    if (!valid) {
      const errors = validate.errors?.map(error => 
        `${error.instancePath || 'root'}: ${error.message}${error.data !== undefined ? ` (got: ${JSON.stringify(error.data)})` : ''}`
      ) || [];
      return { valid: false, errors };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, errors: [`Schema validation error: ${error.message}`] };
  }
} 