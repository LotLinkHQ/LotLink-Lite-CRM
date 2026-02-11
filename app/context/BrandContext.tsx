import React, { createContext, useContext, useEffect, useState } from "react";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { trpc } from "@/lib/trpc";

interface Branding {
    primaryColor: string;
    logoUrl?: string;
    showPoweredBy: boolean;
    name: string;
}

const DEFAULT_BRANDING: Branding = {
    primaryColor: "#0B5E7E", // LotLink Blue
    showPoweredBy: false,
    name: "LotLink",
};

interface BrandContextType {
    branding: Branding;
    isLoading: boolean;
}

const BrandContext = createContext<BrandContextType>({
    branding: DEFAULT_BRANDING,
    isLoading: true,
});

export function BrandProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user } = useDealershipAuth();
    const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

    // Fetch dealership details if authenticated
    // auth.me returns the dealership object directly
    const { data: dealershipData, isLoading } = trpc.auth.me.useQuery(undefined, {
        enabled: !!isAuthenticated && !!user?.id,
        retry: false,
    });

    useEffect(() => {
        if (dealershipData) {
            // dealershipData is the dealership object itself (SelectDealership structure)
            // verify if branding exists on it (it should if schema is updated)
            const dbBranding = (dealershipData as any).branding; // Cast because types might not be regenerated yet
            if (dbBranding) {
                setBranding({
                    primaryColor: dbBranding.primaryColor || DEFAULT_BRANDING.primaryColor,
                    logoUrl: dbBranding.logoUrl,
                    showPoweredBy: dbBranding.showPoweredBy ?? true,
                    name: dealershipData.name,
                });
            } else {
                // Fallback to default but with correct name
                setBranding({
                    ...DEFAULT_BRANDING,
                    name: dealershipData.name
                });
            }
        } else {
            setBranding(DEFAULT_BRANDING);
        }
    }, [dealershipData]);

    return (
        <BrandContext.Provider value={{ branding, isLoading }}>
            {children}
        </BrandContext.Provider>
    );
}

export const useBrand = () => useContext(BrandContext);
