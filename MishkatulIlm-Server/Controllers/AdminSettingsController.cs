using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MishkatulIlm_Server.Authentication;
using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;
using MishkatulIlm_Server.Services;

namespace MishkatulIlm_Server.Controllers;

[ApiController]
[Authorize]
[Route("api/admin/settings")]
public sealed class AdminSettingsController(
    AppDbContext db,
    SchedulingSettingsService schedulingSettings) : ControllerBase
{
    [HttpGet("scheduling")]
    public async Task<IActionResult> GetScheduling(CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        return Ok(await schedulingSettings.GetAsync(cancellationToken));
    }

    [HttpPut("scheduling")]
    public async Task<IActionResult> UpdateScheduling(
        [FromBody] UpdateSchedulingSettingsRequest request,
        CancellationToken cancellationToken)
    {
        if (!await IsCurrentUserAdminAsync(cancellationToken))
            return Forbid();

        try
        {
            return Ok(await schedulingSettings.UpdateAsync(request, cancellationToken));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (TimeZoneNotFoundException)
        {
            return BadRequest(new { message = "Invalid time zone id." });
        }
    }

    private async Task<bool> IsCurrentUserAdminAsync(CancellationToken cancellationToken)
    {
        if (!User.TryGetSupabaseUserId(out var userId))
            return false;

        return await db.Users.AsNoTracking().AnyAsync(u => u.Id == userId && u.IsAdmin, cancellationToken);
    }
}
