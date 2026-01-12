import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { Request, Response, NextFunction } from 'express';

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
        });

        // Validate the DTO instance - try without whitelist first
        const errors: ValidationError[] = await validate(dtoObject, {
          skipMissingProperties: false,
        });
        
        if (errors.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors: errors.map(error => ({
              property: error.property,
              constraints: error.constraints,
            }))
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