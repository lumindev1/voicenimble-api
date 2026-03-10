import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import SkillsConfig from '../models/skills-config.model';
import { AppError } from '../middlewares/error.middleware';

export class SkillsController {
  async getSkills(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = await SkillsConfig.findOne({ shopId: req.shopId });
      if (!config) throw new AppError('Skills config not found', 404);
      res.json({ success: true, skills: config.skills });
    } catch (error) {
      next(error);
    }
  }

  async updateSkills(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { skills } = req.body;
      const config = await SkillsConfig.findOneAndUpdate(
        { shopId: req.shopId },
        { skills },
        { new: true, runValidators: true },
      );
      if (!config) throw new AppError('Skills config not found', 404);
      res.json({ success: true, skills: config.skills });
    } catch (error) {
      next(error);
    }
  }

  async toggleSkill(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { skillId } = req.params;
      const config = await SkillsConfig.findOne({ shopId: req.shopId });
      if (!config) throw new AppError('Skills config not found', 404);

      const skill = config.skills.find((s) => s.skillId === skillId);
      if (!skill) throw new AppError(`Skill ${skillId} not found`, 404);

      skill.isEnabled = !skill.isEnabled;
      await config.save();

      res.json({ success: true, skill });
    } catch (error) {
      next(error);
    }
  }
}
