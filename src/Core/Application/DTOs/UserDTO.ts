import { IsNotEmpty, IsString, IsEmail, IsOptional, IsEnum, IsArray, ValidateNested, Length, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../Enums/UserRole';
import { ILocation } from '../Interface/Entities/auth-and-user/IUser';

export class BaseUserDTO {
  @IsNotEmpty()
  @IsString()
  first_name: string;

  @IsNotEmpty()
  @IsString()
  last_name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  // @IsOptional()
  // @IsString()
  // phone?: string;

  // @IsOptional()
  // @IsString()
  // international_phone?: string;

  @IsOptional()
  @IsString()
  country_code?: string;

  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  password: string;

  @IsOptional()
  @IsString()
  profile_image?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  provider_id?: string;

  @IsOptional()
  @IsString()
  provider_token?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  address?: ILocation;
}

export class CreateUserDTO extends BaseUserDTO {
  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}

export class UpdateUserDTO {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  // @IsOptional()
  // @IsEmail()
  // email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  international_phone?: string;

  @IsOptional()
  @IsString()
  country_code?: string;

  // @IsOptional()
  // @IsString()
  // @Length(8, 255)
  // password?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  location?: ILocation;

  @IsOptional()
  @IsString()
  profile_image?: string;
}

export class RequestEmailUpdateDTO {
  @IsNotEmpty()
  @IsEmail()
  new_email: string;
}

export class UpdateEmailDTO {
  @IsNotEmpty()
  @IsEmail()
  new_email: string;

  @IsNotEmpty()
  @IsString()
  code: string; // OTP code for verification

  @IsNotEmpty()
  @IsString()
  reference: string; // Verification reference
}

export class RequestPhoneUpdateDTO {
  @IsNotEmpty()
  @IsString()
  new_phone: string;

  @IsOptional()
  @IsString()
  international_phone?: string;

  @IsOptional()
  @IsString()
  country_code?: string;
}

export class UpdatePhoneDTO {
  @IsNotEmpty()
  @IsString()
  new_phone: string;

  @IsOptional()
  @IsString()
  international_phone?: string;

  @IsOptional()
  @IsString()
  country_code?: string;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  reference: string;
}

export interface UserResponseDTO {
  id: string;
  first_name: string;
  last_name: string;
  // email?: string;
  // phone: string;
  profile_image?: string;
  roles: string[];
  permissions?: string[];
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  dob?: string;
  address?: string;
  gender?: string;
  reference?: string | null | undefined;
  expiry?: number | null | undefined;
  stage_meta_data?: any;
}

// Enhanced Profile DTOs for API Documentation Compliance
export interface PersonalInfoDTO {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth?: string;
  address?: string;
  profile_image?: string;
  join_date?: string;
}

export interface BusinessInfoDTO {
  business_name?: string;
  business_type?: string;
  years_of_experience?: number;
  specializations?: string[];
  service_areas?: string[];
  business_registration?: string;
  tax_id?: string;
}

export interface UserPreferencesDTO {
  email_notifications?: boolean;
  sms_notifications?: boolean;
  job_alerts?: boolean;
  marketing_emails?: boolean;
  weekly_reports?: boolean;
  profile_visibility?: 'public' | 'private';
  availability_status?: 'available' | 'busy' | 'unavailable';
}

export interface UserStatsDTO {
  total_jobs?: number;
  completed_jobs?: number;
  average_rating?: number;
  total_earnings?: number;
  response_time?: string;
  completion_rate?: number;
}

export interface UserProfileResponseDTO {
  personal_info: PersonalInfoDTO;
  business_info: BusinessInfoDTO;
  preferences: UserPreferencesDTO;
  stats: UserStatsDTO;
}

export interface UpdateProfileRequestDTO {
  personal_info?: Partial<PersonalInfoDTO>;
  business_info?: Partial<BusinessInfoDTO>;
  preferences?: Partial<UserPreferencesDTO>;
}

export interface OAuthDTO {
  code: string,
  state: string
}


export class createAdminUserDTO {
  @IsNotEmpty({ message: 'First name is required' })
  @IsString({ message: 'First name must be a string' })
  first_name: string;

  @IsNotEmpty({ message: 'Last name is required' })
  @IsString({ message: 'Last name must be a string' })
  @IsString()
  last_name: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({},{ message: 'Email must be a valid email address' })
  @IsEmail()
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString({ message: 'Password must be a string' })
  @Length(8, 255, { message: 'Password must be between 8 and 255 characters long' })
  password: string;
}