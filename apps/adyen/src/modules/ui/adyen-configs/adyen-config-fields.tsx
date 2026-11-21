// apps/adyen/src/modules/ui/adyen-configs/adyen-config-fields.tsx
import { Box, Text } from "@saleor/macaw-ui";
import { Input } from "@saleor/react-hook-form-macaw";
import { type Control, type FieldErrors } from "react-hook-form";

export type AdyenConfigFormShape = {
  name: string;
  merchantAccount: string;
  apiKey: string;
  clientKey: string;
  hmacKey: string;
};

type Props = {
  control: Control<AdyenConfigFormShape>;
  errors: FieldErrors<AdyenConfigFormShape>;
  disabled?: boolean;
};

export const AdyenConfigFields = ({ control, errors, disabled = false }: Props) => (
  <Box display="flex" flexDirection="column" gap={6}>
    <Input
      label={<Text size={2}>Configuration name</Text>}
      name="name"
      control={control}
      disabled={disabled}
      helperText={errors.name?.message ?? "For example “Live” or “UK Live”."}
      error={!!errors.name}
    />
    <Input
      label={<Text size={2}>Merchant Account</Text>}
      name="merchantAccount"
      control={control}
      disabled={disabled}
      helperText={errors.merchantAccount?.message ?? "Found in your Adyen Customer Area."}
      error={!!errors.merchantAccount}
    />
    <Input
      label={<Text size={2}>API Key</Text>}
      name="apiKey"
      control={control}
      type="password"
      disabled={disabled}
      helperText={errors.apiKey?.message ?? "Generate in Developers > API credentials > Web service user."}
      error={!!errors.apiKey}
    />
    <Input
      label={<Text size={2}>Client Key</Text>}
      name="clientKey"
      control={control}
      disabled={disabled}
      helperText={errors.clientKey?.message ?? "Used for the frontend Drop-in. Starts with test_ or live_."}
      error={!!errors.clientKey}
    />
    <Input
      label={<Text size={2}>HMAC Key</Text>}
      name="hmacKey"
      control={control}
      type="password"
      disabled={disabled}
      helperText={errors.hmacKey?.message ?? "Used for webhook verification. Hex string."}
      error={!!errors.hmacKey}
    />
  </Box>
);

export const FieldHint = (props: { children?: React.ReactNode }) => (
  <div
    style={{
      fontSize: 12,
      lineHeight: 1.5,
      color: "#666",
      marginTop: 4,
    }}
  >
    {props.children}
  </div>
);
