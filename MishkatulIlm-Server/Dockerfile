# Fly.io — API only (Angular app deploys separately on Vercel)
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["MishkatulIlm-Server.csproj", "./"]
RUN dotnet restore "MishkatulIlm-Server.csproj"
COPY . .
RUN dotnet publish "MishkatulIlm-Server.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "MishkatulIlm-Server.dll"]
