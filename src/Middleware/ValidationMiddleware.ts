import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { Request, Response, NextFunction } from 'express';

function flattenValidationErrors(
  errors: ValidationError[],
  parent = ''
): Array<{ property: string; message: string }> {
  const result: Array<{ property: string; message: string }> = [];
  for (const error of errors) {
    const property = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        result.push({ property, message });
      }
    }
    if (error.children?.length) {
      result.push(...flattenValidationErrors(error.children, property));
    }
  }
  return result;
}

// export function validationMiddleware(dtoClass: any) {
//   return async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       // Transform plain object to class instance
//       const dtoObject = plainToInstance(dtoClass, req.body);

//       // Validate
//       const errors = await validate(dtoObject);
      
//       console.log({errors})

//       if (errors.length > 0) {
//         return res.status(400).json({
//           status: 'error',
//           message: 'Validation failed',
//           errors: errors.map(error => ({
//             property: error.property,
//             constraints: error.constraints
//           }))
//         });
//       }
      
//       // Add validated object to request
//       req.body = dtoObject;
//       next();
//     } catch (error) {
//       return res.status(500).json({
//         status: 'error',
//         message: 'Internal server error during validation'
//       });
//     }
//   };
// }

export function validationMiddleware(dtoClass: any) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dtoObject = plainToInstance(dtoClass, req.body, {
            enableImplicitConversion: true,
            exposeDefaultValues: true,
            excludeExtraneousValues: false,
        });

        // Validate the DTO instance
        const errors: ValidationError[] = await validate(dtoObject, {
          skipMissingProperties: false,
          whitelist: false,
          forbidNonWhitelisted: false,
        });
        
        if (errors.length > 0) {
          const flattened = flattenValidationErrors(errors);
          return res.status(400).json({
            success: false,
            message: flattened[0]?.message ?? 'Validation failed',
            error_code: 100,
            data: { errors: flattened },
          });
        }
        
        // Replace the original body with the validated and transformed object.
        req.body = dtoObject;
        next();
      } catch (error) {
        console.error('Validation middleware error:', error);
        
        return res.status(500).json({
          status: 'error',
          message: 'Internal server error during validation'
        });
      }
    };
}